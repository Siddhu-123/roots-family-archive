import React from 'react';
import { createRoot } from 'react-dom/client';
import { ArchiveProvider } from './storage';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><ArchiveProvider><App/></ArchiveProvider></React.StrictMode>);
