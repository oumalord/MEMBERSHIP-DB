import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { BrandingProvider } from './branding';
import './index.css';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrandingProvider>
            <App />
        </BrandingProvider>
    </StrictMode>
);
