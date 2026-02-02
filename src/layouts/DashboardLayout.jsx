import { Outlet, Link } from "react-router-dom";

export default function DashboardLayout() {
  return (
    <div style={{ display: "flex" }}>
      <nav style={{ width: "200px", padding: "1rem", borderRight: "1px solid #ccc" }}>
        <ul>
          <li><Link to="/dashboard">Dashboard Home</Link></li>
          <li><Link to="/dashboard/resume/new">New Resume</Link></li>
          <li><Link to="/dashboard/cover-letter/new">New Cover Letter</Link></li>
          <li><Link to="/settings">Settings</Link></li>
          <li><Link to="/payment">Payment</Link></li>
        </ul>
      </nav>
      <main style={{ flex: 1, padding: "1rem" }}>
        <Outlet />
      </main>
    </div>
  );
}
