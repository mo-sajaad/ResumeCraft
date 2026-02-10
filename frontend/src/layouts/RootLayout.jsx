import { Outlet } from "react-router-dom";

export default function RootLayout() {
  return (
    <div>
      <header>
        <h1>My App</h1>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
