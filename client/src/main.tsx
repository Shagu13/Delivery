import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// FiraGO — covers Georgian + Latin scripts (replaces Plus Jakarta Sans)
// Weights: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
import '@fontsource/firago/400.css'
import '@fontsource/firago/500.css'
import '@fontsource/firago/600.css'
import '@fontsource/firago/700.css'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
