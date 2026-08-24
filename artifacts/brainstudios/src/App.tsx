import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { ProductionProvider } from '@/components/layout/ProductionContext';
import { AppLayout } from '@/components/layout/AppLayout';

import Home from '@/pages/Home';
import NewProduction from '@/pages/NewProduction';
import StoryPage from '@/pages/Story';
import CharactersPage from '@/pages/Characters';
import StoryboardPage from '@/pages/Storyboard';
import ProductionPage from '@/pages/Production';
import ActivityPage from '@/pages/Activity';
import SettingsPage from '@/pages/Settings';
import SignIn from '@/pages/SignIn';
import SignUp from '@/pages/SignUp';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        {/* Auth routes don't use AppLayout */}
        <Route path="/sign-in" component={SignIn} />
        <Route path="/sign-up" component={SignUp} />
        
        {/* All other routes use the standard layout */}
        <Route>
          <AppLayout>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/new" component={NewProduction} />
              <Route path="/story" component={StoryPage} />
              <Route path="/characters" component={CharactersPage} />
              <Route path="/storyboard" component={StoryboardPage} />
              <Route path="/production" component={ProductionPage} />
              <Route path="/activity" component={ActivityPage} />
              <Route path="/settings" component={SettingsPage} />
              <Route component={NotFound} />
            </Switch>
          </AppLayout>
        </Route>
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProvider
        publishableKey={clerkPubKey}
        proxyUrl={clerkProxyUrl}
        signInUrl={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        appearance={{
          theme: dark,
          variables: {
            colorPrimary: '#ff8b22',
            colorBackground: '#111116',
            colorInput: '#1c1c25',
            colorInputForeground: '#f4f1ea',
            colorForeground: '#f4f1ea',
            colorMutedForeground: '#a2a0ad',
            colorNeutral: '#34333d',
            fontFamily: 'Outfit, sans-serif',
            borderRadius: '8px',
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <ProductionProvider>
              <Router />
              <Toaster />
            </ProductionProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ClerkProvider>
    </WouterRouter>
  );
}

export default App;
