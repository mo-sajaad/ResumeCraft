import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FaAngleDoubleLeft,
  FaAngleDoubleRight,
  FaBars,
  FaChartLine,
  FaCog,
  FaGem,
  FaRegAddressCard,
  FaRegEnvelope,
  FaShieldAlt,
  FaTh,
  FaTimes,
} from "react-icons/fa";

import Breadcrumbs from "../components/ui/Breadcrumbs";
import { useAuth } from "../context/useAuth";
import { ROUTES } from "../constants/routes";
import { TOOL_MAP } from "../pages/dashboard/career-lab/careerLabTools";

import "./DashboardLayout.css";

const SIDEBAR_STATE_KEY = "dashboardSidebarCollapsed";

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
      { to: ROUTES.PAYMENT, label: "Billing", icon: <FaGem /> },
      { to: ROUTES.SETTINGS, label: "Settings", icon: <FaCog /> },
      { to: ROUTES.ADMIN, label: "Admin", icon: <FaShieldAlt />, adminOnly: true },
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

function titleize(segment = "") {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildBreadcrumbs(pathname) {
  if (!pathname.startsWith("/dashboard")) return [];

  const parts = pathname.split("/").filter(Boolean);
  const crumbs = [{ label: "Dashboard", to: ROUTES.DASHBOARD }];

  if (parts.length === 1) return crumbs;

  const section = parts[1];

  if (section === "resume" && parts[2] === "new") {
    crumbs.push({ label: "Create Resume", to: ROUTES.RESUME_NEW });
    return crumbs;
  }

  if (section === "cover-letter" && parts[2] === "new") {
    crumbs.push({ label: "Create Cover Letter", to: ROUTES.COVERLETTER_NEW });
    return crumbs;
  }

  if (section === "editor") {
    crumbs.push({ label: "Editor", to: ROUTES.DOCUMENT_WORKSPACE });
    return crumbs;
  }

  if (section === "payment") {
    crumbs.push({ label: "Billing", to: ROUTES.PAYMENT });
    return crumbs;
  }

  if (section === "settings") {
    crumbs.push({ label: "Settings", to: ROUTES.SETTINGS });
    return crumbs;
  }

  if (section === "admin") {
    crumbs.push({ label: "Admin", to: ROUTES.ADMIN });
    return crumbs;
  }

  if (section === "career-lab") {
    crumbs.push({ label: "Career Lab", to: ROUTES.CAREER_LAB });

    if (parts[2] === "tools" && parts[3]) {
      const tool = TOOL_MAP[parts[3]];
      crumbs.push({ label: tool?.title || titleize(parts[3]), to: pathname });
    }

    return crumbs;
  }

  crumbs.push({ label: titleize(section), to: pathname });
  return crumbs;
}

function getStoredSidebarState() {
  try {
    return localStorage.getItem(SIDEBAR_STATE_KEY) === "true";
  } catch {
    return false;
  }
}

export default function DashboardLayout() {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getStoredSidebarState);
  const menuRef = useRef(null);

  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const userDisplayName = useMemo(
    () => profile?.full_name?.trim() || user?.displayName?.trim() || user?.email || profile?.email || "Guest User",
    [profile?.email, profile?.full_name, user]
  );
  const userInitials = useMemo(() => getInitials(userDisplayName, user?.email || profile?.email), [profile?.email, user?.email, userDisplayName]);
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

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STATE_KEY, String(isSidebarCollapsed));
    } catch {
      // no-op if storage unavailable
    }
  }, [isSidebarCollapsed]);

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
    <div className={`dashboard-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`dashboard-sidebar ${mobileSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-icon">✦</div>
          <span className="brand-label">ResumeCraft</span>
          <button className="sidebar-close" type="button" onClick={() => setMobileSidebarOpen(false)} aria-label="Close navigation">
            <FaTimes />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="sidebar-section-label">{group.label}</div>
              {group.links.filter((link) => !link.adminOnly || profile?.is_admin).map((link) => (
                <NavLink key={link.to} to={link.to} end={link.end} className="sidebar-link" title={link.label}>
                  <span className="nav-icon">{link.icon}</span>
                  <span className="sidebar-link-text">{link.label}</span>
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
            <button
              className="sidebar-collapse-toggle"
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? <FaAngleDoubleRight /> : <FaAngleDoubleLeft />}
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
                <span className="user-name">{userDisplayName}</span>
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
