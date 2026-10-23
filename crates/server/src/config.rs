use anyhow::{bail, ensure, Context, Result};
use std::{ffi::OsString, net::SocketAddr, path::PathBuf};

pub const DEFAULT_MAX_BODY_BYTES: usize = 1024 * 1024;
pub const MAX_BODY_BYTES: usize = 64 * 1024 * 1024;

pub const HELP: &str = "NoteWren sync server

Usage: notewren-server [--bind ADDRESS:PORT] [--data-dir PATH] [--max-body-bytes BYTES]

Flags override these environment variables:
  NOTEWREN_SERVER_BIND            Default: 127.0.0.1:8787
  NOTEWREN_SERVER_DATA_DIR        Default: ./notewren-server-data
  NOTEWREN_SERVER_MAX_BODY_BYTES  Default: 1048576 (1 MiB), maximum: 67108864 (64 MiB)

Required environment variable:
  NOTEWREN_SERVER_ADMIN_TOKEN     Provisioning bearer token, 32 to 512 printable ASCII
                                 bytes without spaces. No command-line token option.

POST /v1/libraries with Authorization: Bearer <admin token>, Content-Type: application/json
  JSON: {\"library_id\":\"<UUID>\",\"token\":\"<independent library token>\"}
  Library tokens have the same length and character rules as the admin token.
  Repeating the same library ID and token succeeds without replacing any data.

POST /v1/sync/pull with the library bearer token
  JSON: {\"library_id\":\"<UUID>\"}
POST /v1/sync/push with the library bearer token
  JSON: {\"operation\":<notewren_sync::SyncOperation>}

All endpoints return JSON. Credentials must never be placed in URLs.
SQLite catalog and individual library databases persist under the data directory.
Keep the directory private and back it up with a SQLite-aware backup procedure.
New data directories are owner-only on Unix; existing permissions are unchanged.
HTTP has no built-in TLS. Non-loopback binding requires an HTTPS reverse proxy
and a protected upstream network. Disable proxy request-body and credential logging.
Ctrl-C stops accepting requests and allows accepted requests to finish.
";

/// Secrets deliberately have no Debug implementation and are accepted only through the environment.
pub struct ServerConfig {
    pub bind: SocketAddr,
    pub data_dir: PathBuf,
    pub admin_token: String,
    pub max_body_bytes: usize,
}

impl ServerConfig {
    pub fn from_env_and_args() -> Result<Option<Self>> {
        Self::from_sources(std::env::args_os().skip(1), |key| std::env::var_os(key))
    }

    fn from_sources(
        args: impl IntoIterator<Item = OsString>,
        env: impl Fn(&str) -> Option<OsString>,
    ) -> Result<Option<Self>> {
        let mut bind = env("NOTEWREN_SERVER_BIND").unwrap_or_else(|| "127.0.0.1:8787".into());
        let mut data_dir =
            env("NOTEWREN_SERVER_DATA_DIR").unwrap_or_else(|| "./notewren-server-data".into());
        let mut max_body = env("NOTEWREN_SERVER_MAX_BODY_BYTES")
            .unwrap_or_else(|| DEFAULT_MAX_BODY_BYTES.to_string().into());
        let mut args = args.into_iter();
        while let Some(flag) = args.next() {
            let destination = match flag.to_str() {
                Some("--help" | "-h") => return Ok(None),
                Some("--bind") => &mut bind,
                Some("--data-dir") => &mut data_dir,
                Some("--max-body-bytes") => &mut max_body,
                _ => bail!("Unknown option; use --help"),
            };
            *destination = args.next().context("Option requires a value; use --help")?;
        }
        let admin_token = env("NOTEWREN_SERVER_ADMIN_TOKEN")
            .context("NOTEWREN_SERVER_ADMIN_TOKEN is required")?
            .into_string()
            .map_err(|_| anyhow::anyhow!("Admin token must be printable ASCII"))?;
        let config = Self {
            bind: bind
                .to_str()
                .context("Bind address must be UTF-8")?
                .parse()
                .context("Invalid bind address; use an IP address and port")?,
            data_dir: data_dir.into(),
            admin_token,
            max_body_bytes: max_body
                .to_str()
                .context("Body limit must be an integer")?
                .parse()
                .context("Body limit must be a positive integer")?,
        };
        config.validate()?;
        Ok(Some(config))
    }

    pub fn validate(&self) -> Result<()> {
        ensure!(
            valid_token(&self.admin_token),
            "Admin token must contain 32 to 512 printable ASCII bytes without spaces"
        );
        ensure!(
            !self.data_dir.as_os_str().is_empty(),
            "Data directory cannot be empty"
        );
        ensure!(
            (1..=MAX_BODY_BYTES).contains(&self.max_body_bytes),
            "Body limit must be between 1 and 67108864 bytes"
        );
        Ok(())
    }
}

pub(crate) fn valid_token(token: &str) -> bool {
    (32..=512).contains(&token.len()) && token.bytes().all(|byte| (0x21..=0x7e).contains(&byte))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(key: &str) -> Option<OsString> {
        (key == "NOTEWREN_SERVER_ADMIN_TOKEN").then(|| "test-admin-token-at-least-32-bytes".into())
    }

    #[test]
    fn defaults_bind_only_loopback_and_require_admin_token() {
        let config = ServerConfig::from_sources([], env).unwrap().unwrap();
        assert_eq!(config.bind.to_string(), "127.0.0.1:8787");
        assert_eq!(config.max_body_bytes, DEFAULT_MAX_BODY_BYTES);
        assert_eq!(config.data_dir, PathBuf::from("./notewren-server-data"));
        assert!(ServerConfig::from_sources([], |_| None).is_err());
    }

    #[test]
    fn flags_override_environment_without_accepting_secrets() {
        let args = [
            "--bind",
            "127.0.0.1:9000",
            "--data-dir",
            "other",
            "--max-body-bytes",
            "4096",
        ]
        .map(OsString::from);
        let config = ServerConfig::from_sources(args, |key| {
            if key == "NOTEWREN_SERVER_BIND" {
                Some("127.0.0.1:1234".into())
            } else {
                env(key)
            }
        })
        .unwrap()
        .unwrap();
        assert_eq!(config.bind.port(), 9000);
        assert_eq!(config.data_dir, PathBuf::from("other"));
        assert_eq!(config.max_body_bytes, 4096);
        assert!(ServerConfig::from_sources(["--admin-token".into()], env).is_err());
        assert!(ServerConfig::from_sources(["--max-body-bytes".into(), "0".into()], env).is_err());
        assert!(ServerConfig::from_sources(["--help".into()], |_| None)
            .unwrap()
            .is_none());
    }
}
