import { createRootRoute } from '@tanstack/react-router';
import App from '../app/App.tsx';

// The whole app is one shell that keeps its pages mounted, so the routes below only say which page is showing.
export const Route = createRootRoute({ component: App });
