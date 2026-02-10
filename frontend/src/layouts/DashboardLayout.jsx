import React, { useState } from 'react';
import { NavLink, Outlet } from "react-router-dom";
import "./DashboardLayout.css";

import { FaRegAddressCard } from 'react-icons/fa'; // For Resume icon
import { FaRegEnvelope } from 'react-icons/fa';    // For Cover Letter icon
import { FaGem } from 'react-icons/fa';            // For Premium icon
import { FaCog } from 'react-icons/fa';            // For Settings icon
import { FaTh } from 'react-icons/fa';             // For Dashboard icon

export default function DashboardLayout() {
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const toggleDropdown = () => {
    setDropdownVisible(!dropdownVisible);
  };

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">✦</div>
          ResumeCraft
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" end className="sidebar-link">
            <span className="nav-icon"><FaTh /></span>
            Dashboard
          </NavLink>
          <NavLink to="/dashboard/resume/new" className="sidebar-link">
            <span className="nav-icon"><FaRegAddressCard /></span>
            Create Resume
          </NavLink>
          <NavLink to="/dashboard/cover-letter/new" className="sidebar-link">
            <span className="nav-icon"><FaRegEnvelope /></span>
            Create Cover Letter
          </NavLink>
          <NavLink to="/dashboard/payment" className="sidebar-link">
            <span className="nav-icon"><FaGem /></span>
            Premium
          </NavLink>
          <NavLink to="/dashboard/settings" className="sidebar-link">
            <span className="nav-icon"><FaCog /></span>
            Settings
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          Keep your documents fresh by revisiting them weekly for quick updates.
        </div>
      </aside>
      <div className="dashboard-main">
        <div className="dashboard-topbar">
          <div className="user-chip" onClick={toggleDropdown}>
            <div className="user-avatar">JD</div>
            <div className="user-details">
              <span className="user-name">John Doe</span>
              <span className="user-plan">Free Plan</span>
            </div>
            {dropdownVisible && (
              <div className="user-dropdown">
                <ul>
                  <li><NavLink to="/dashboard/settings" className="dropdown-link">Profile</NavLink></li>
                  <li><NavLink to="/dashboard/settings" className="dropdown-link">Settings</NavLink></li>
                  <li><NavLink to="/auth/login" className="dropdown-link">Log Out</NavLink></li>
                </ul>
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
