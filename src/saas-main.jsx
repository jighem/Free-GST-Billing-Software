import React from 'react';
import {createRoot} from 'react-dom/client';
import SaasGate from './saas/SaasGate.jsx';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './index.css';

// Dedicated SaaS entry uses the ORIGINAL src/App.jsx after authentication.
// The offline/PWA bootstrap, desktop PIN lock and local Express server are NOT
// mounted in this entry; their integration must be reviewed separately.
createRoot(document.getElementById('root')).render(<SaasGate/>);
