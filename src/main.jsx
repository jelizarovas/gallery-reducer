import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { GamepadProvider } from './gamepad/GamepadProvider.jsx';
import App from './App.jsx';
import './styles.css';

// HashRouter: the app is served as static files (GitHub Pages included), so routes live after the # and
// every address still loads index.html.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GamepadProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </GamepadProvider>
  </StrictMode>,
);
