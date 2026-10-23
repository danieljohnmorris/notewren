use anyhow::{Context, Result};
use notewren_server::{
    config::{ServerConfig, HELP},
    router,
};

#[tokio::main]
async fn main() -> Result<()> {
    let Some(config) = ServerConfig::from_env_and_args()? else {
        print!("{HELP}");
        return Ok(());
    };
    let app = router(&config)?;
    let listener = tokio::net::TcpListener::bind(config.bind)
        .await
        .context("Cannot bind server listener")?;
    eprintln!(
        "NoteWren sync listening on http://{}",
        listener.local_addr()?
    );
    if !config.bind.ip().is_loopback() {
        eprintln!(
            "Non-loopback HTTP requires an HTTPS reverse proxy and a protected upstream network"
        );
    }
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            if tokio::signal::ctrl_c().await.is_err() {
                eprintln!("Cannot install Ctrl-C handler; stopping server");
            }
        })
        .await
        .context("HTTP server stopped unexpectedly")?;
    Ok(())
}
