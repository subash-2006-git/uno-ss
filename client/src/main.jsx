import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './responsive.css';
import './theme.css';
import './social.css';
import './table.css';
import { installAudioUnlock } from './sound.js';

installAudioUnlock();

createRoot(document.getElementById('root')).render(<App />);
