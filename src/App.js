import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./index.css";
import NotFoundPage from "./pages/NotFoundPage";
import ContentsPage from './pages/ContentsPage'
import AgendaPage from './pages/AgendaPage'
import ArticlesPage from './pages/ArticlesPage'
import ArticlePage from './pages/ArticlePage'
import ArticlesAdminPage from './pages/ArticlesAdminPage'

function App() {
  return (
    <Router future={{
      v7_startTransition: true,
      v7_relativeSplatPath: true
    }}>
      <div className="flex flex-col justify-between min-h-screen bg-white">
        <main className="flex-grow my-auto">
          <Routes>
            {[
              { path: '/', element: <ContentsPage /> },
              { path: '/agenda', element: <AgendaPage /> },
              { path: '/articulos', element: <ArticlesPage /> },
              { path: '/admin/articulos', element: <ArticlesAdminPage /> },
              // Articles live at the old WordPress permalink: /<slug>/.
              { path: '/:slug', element: <ArticlePage /> },
              { path: '*', element: <NotFoundPage /> }
            ].map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={route.element}
              />

            ))}
          </Routes>
        </main>
      </div>
    </Router>
  );
}
export default App;


