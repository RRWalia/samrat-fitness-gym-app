import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const savedTheme = window.localStorage.getItem('samrat-ui-theme');
const initialTheme = savedTheme === 'light' || savedTheme === 'dark'
  ? savedTheme
  : (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
document.documentElement.classList.add(initialTheme === 'light' ? 'theme-light' : 'theme-dark');
document.documentElement.style.colorScheme = initialTheme;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
