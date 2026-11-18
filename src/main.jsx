import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GamepadProvider } from './gamepad/GamepadProvider.jsx';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GamepadProvider>
      <App />
    </GamepadProvider>
  </StrictMode>,
);
