import { Route, Router, Switch, useLocation } from 'wouter'
import { HomePage } from './pages/HomePage'
import { SharePage } from './pages/SharePage'
import { ErrorState } from './components/states/ErrorState'
import { ChichibooFooter } from './components/ChichibooFooter'
import { Toaster } from './components/ui/Toaster'

export default function App() {
  return (
    <Router>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/s/:id">{(params) => <SharePage shareId={params.id} />}</Route>
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </Router>
  )
}

function NotFound() {
  const [, navigate] = useLocation()
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <ErrorState
        title="페이지를 찾을 수 없습니다."
        detail="주소를 다시 확인해주세요."
        actionLabel="SheetPage 시작하기"
        onAction={() => navigate('/')}
      />
      <ChichibooFooter />
    </div>
  )
}
