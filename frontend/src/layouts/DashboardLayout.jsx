import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FaBars,
  FaChartLine,
  FaCog,
  FaGem,
  FaRegAddressCard,
  FaRegEnvelope,
  FaTh,
  FaTimes,
} from "react-icons/fa";

import Breadcrumbs from "../components/ui/Breadcrumbs";
import { useAuth } from "../context/useAuth";
import { ROUTES } from "../constants/routes";

import "./DashboardLayout.css";

const NAV_GROUPS = [
  {
    label: "Create",
    links: [
      { to: ROUTES.DASHBOARD, label: "Dashboard", icon: <FaTh />, end: true },
      { to: ROUTES.RESUME_NEW, label: "Resume", icon: <FaRegAddressCard /> },
      { to: ROUTES.COVERLETTER_NEW, label: "Cover Letter", icon: <FaRegEnvelope /> },
    ],
  },
  {
    label: "Analyze",
    links: [
      { to: ROUTES.CAREER_LAB, label: "Career Lab", icon: <FaChartLine /> },
    ],
  },
  {
    label: "Account",
    links: [
      { to: ROUTES.PAYMENT, label: "Premium", icon: <FaGem /> },
      { to: ROUTES.SETTINGS, label: "Settings", icon: <FaCog /> },
    ],
  },
];

const getInitials = (name, email) => {
  const source = name?.trim() || email?.split("@")[0] || "";
  if (!source) return "U";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

function buildBreadcrumbs(pathname) {
  if (!pathname.startsWith("/dashboard")) return [];
  const crumbs = [{ label: "Dashboard", to: ROUTES.DASHBOARD }];
  if (pathname.includes("/career-lab")) {
    crumbs.push({ label: "Career Lab", to: ROUTES.CAREER_LAB });
    if (pathname.includes("/tools/")) crumbs.push({ label: "Tool", to: pathname });
  }
  return crumbs;
}

export default function DashboardLayout() {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const menuRef = useRef(null);

  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const userDisplayName = useMemo(() => user?.displayName?.trim() || user?.email || "Guest User", [user]);
  const userInitials = useMemo(() => getInitials(userDisplayName), [userDisplayName]);
  const planLabel = useMemo(() => {
    const code = (profile?.plan_code || "free").toLowerCase();
    return `${code.charAt(0).toUpperCase()}${code.slice(1)} Plan`;
  }, [profile?.plan_code]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(location.pathname), [location.pathname]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) setDropdownVisible(false);
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout?.();
      navigate(ROUTES.LOGIN, { replace: true });
    } finally {
      setIsLoggingOut(false);
      setDropdownVisible(false);
    }
  };

  return (
    <div className="dashboard-shell">
      <aside className={`dashboard-sidebar ${mobileSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-icon">✦</div>
          ResumeCraft
          <button className="sidebar-close" type="button" onClick={() => setMobileSidebarOpen(false)} aria-label="Close navigation">
            <FaTimes />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="sidebar-section-label">{group.label}</div>
              {group.links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end} className="sidebar-link">
                  <span className="nav-icon">{link.icon}</span>
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {mobileSidebarOpen ? <button type="button" aria-label="Close menu overlay" className="sidebar-overlay" onClick={() => setMobileSidebarOpen(false)} /> : null}

      <div className="dashboard-main">
        <div className="dashboard-topbar">
          <div className="topbar-left">
            <button className="menu-toggle" type="button" onClick={() => setMobileSidebarOpen(true)} aria-label="Open navigation menu">
              <FaBars />
            </button>
            <Breadcrumbs items={breadcrumbs} />
          </div>
          <div className="user-chip-wrap" ref={menuRef}>
            <button
              className="user-chip"
              type="button"
              onClick={() => setDropdownVisible((p) => !p)}
              aria-haspopup="menu"
              aria-expanded={dropdownVisible}
            >
              <div className="user-avatar">{userInitials}</div>
              <div className="user-details">
                <span className="user-name">{profile?.full_name || userDisplayName}</span>
                <span className="user-plan">{planLabel}</span>
              </div>
            </button>
            {dropdownVisible && (
              <div className="user-dropdown" role="menu">
                <NavLink to={ROUTES.SETTINGS} className="dropdown-link" role="menuitem">Profile</NavLink>
                <NavLink to={ROUTES.SETTINGS} className="dropdown-link" role="menuitem">Settings</NavLink>
                <button type="button" className="dropdown-link" role="menuitem" onClick={handleLogout} disabled={isLoggingOut}>
                  {isLoggingOut ? "Logging out..." : "Log Out"}
                </button>
              </div>
            )}
          </div>
        </div>
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
