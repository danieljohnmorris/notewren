import { createRoot } from 'react-dom/client';
import './tokens.css';
import './app.css';
import { App } from './App';

document.documentElement.dataset.platform = /Mac/.test(navigator.platform) ? 'mac' : 'other';

createRoot(document.getElementById('root')!).render(<App />);
