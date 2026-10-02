import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import GoogleDriveDashboard from "./pages/GoogleDriveDashboard";
import PendingApproval from "./pages/PendingApproval";
import AdminUsers from "@/pages/AdminUsers";
import RestaurantList from "@/pages/RestaurantList";
import { useAuth } from "@/_core/hooks/useAuth";

function Router() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  // 未登入：一律顯示登入頁（Home）
  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/404" component={NotFound} />
        <Route component={Home} />
      </Switch>
    );
  }

  const isAdmin = user?.role === "admin";
  const isApproved = isAdmin || user?.accessStatus === "approved";

  // 已登入但未獲批准（pending / rejected）：只顯示等待批准頁
  if (!isApproved) {
    return (
      <Switch>
        <Route path="/404" component={NotFound} />
        <Route component={PendingApproval} />
      </Switch>
    );
  }

  // 已批准（或 admin）：可進入 dashboard 與相關頁面
  return (
    <Switch>
      <Route path="/" component={GoogleDriveDashboard} />
      <Route path="/dashboard" component={GoogleDriveDashboard} />
      {isAdmin && <Route path="/admin/users" component={AdminUsers} />}
      <Route path="/restaurants" component={RestaurantList} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
