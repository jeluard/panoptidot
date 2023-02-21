import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { App } from './App.js';

const container = document.createElement('div');
document.body.appendChild(container);
ReactDOMClient.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
