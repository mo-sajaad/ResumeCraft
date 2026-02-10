import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

import "./ResumePages.css";


export default function PersonalInfoCard({
  fullName,
  setFullName,
  email,
  setEmail,
  phoneNumber,
  setPhoneNumber,
  location,
  setLocation,
  linkedin,
  setLinkedin,
}) {
  return (
    <div className="content-card">
      <h3>Personal Information</h3>
      <div className="input-group">
        <label htmlFor="full-name">Full Name</label>
        <input
          id="full-name"
          placeholder="John Doe"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>
      <div className="input-grid">
        <div className="input-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            placeholder="john.doe@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="input-group">
          <label htmlFor="phone">Phone</label>
          <PhoneInput
            international
            defaultCountry="US"
            value={phoneNumber}
            onChange={setPhoneNumber}
            placeholder="(555) 123-4567"
            className="input-phone"
          />
        </div>
        <div className="input-group">
          <label htmlFor="location">Location</label>
          <input
            id="location"
            placeholder="San Francisco, CA"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div className="input-group">
          <label htmlFor="linkedin">LinkedIn</label>
          <input
            id="linkedin"
            placeholder="linkedin.com/in/johndoe"
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
