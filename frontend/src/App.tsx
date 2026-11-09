import { AppShell } from './components/layout/AppShell';
import { useTheme } from './hooks/useTheme';
import { LandingPage } from './pages/LandingPage';

export function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <AppShell theme={theme} onToggleTheme={toggleTheme}>
      <LandingPage />
    </AppShell>
  );
}

export default App;
