import { LegalPage } from './Legal'

export default function Privacy() {
  return (
    <LegalPage
      label="Privacy"
      title="Privacy Policy"
      metaTitle="Privacy Policy | MediRoute"
      metaDesc="What the MediRoute prototype handles, what it never collects, and where data is stored."
      intro="MediRoute is a hackathon prototype. It is built to need as little personal data as possible. This page explains what it handles, what it never touches, and where anything is kept."
      sections={[
        {
          id: 'handles',
          title: 'What the prototype handles',
          body: (
            <>
              <p>To match a patient to a hospital, the prototype uses only:</p>
              <ul>
                <li>Injury class, such as head injury or severe burns</li>
                <li>Glasgow Coma Scale (GCS) score</li>
                <li>Vitals: pulse, blood pressure and oxygen saturation</li>
                <li>Crash location as map coordinates</li>
                <li>Timestamps for the call, dispatch, signals and arrival</li>
              </ul>
              <p>In this prototype all of these are sample values that you or the demo enter.</p>
            </>
          ),
        },
        {
          id: 'never',
          title: 'What it never collects',
          body: (
            <>
              <p>There is no field anywhere for a patient name, phone number, Aadhaar or any other ID number. A handover note describes the injury, not the person.</p>
              <p>Voice triage runs through your browser's speech recognition. The prototype keeps only the text fields it fills, never the audio.</p>
            </>
          ),
        },
        {
          id: 'dpdp',
          title: 'Digital Personal Data Protection Act 2023',
          body: (
            <p>
              The design follows the principles of India's Digital Personal Data Protection Act 2023: collect only what the purpose needs, use it only for that purpose, and keep it only as long as needed. Injury class is enough to route an ambulance, so that is all the system asks for.
            </p>
          ),
        },
        {
          id: 'storage',
          title: 'Where data is stored',
          body: (
            <>
              <p>
                This prototype has no server. Case and trip data live only in your browser, in localStorage and sessionStorage, so that two tabs on the same computer can stay in sync.
              </p>
              <p>
                To calculate road routes, the crash and hospital coordinates are sent to the public OSRM routing service at router.project-osrm.org. Map tiles are loaded from OpenFreeMap or CARTO. No case details are sent to these services, only coordinates.
              </p>
            </>
          ),
        },
        {
          id: 'access',
          title: 'Access in a future production version',
          body: (
            <p>
              A production version would use role-based access: 112 operators see cases and routes, hospitals see only cases sent to them, and traffic police see corridor requests without any clinical details. Every action would be logged with who did it and when.
            </p>
          ),
        },
        {
          id: 'retention',
          title: 'Retention',
          body: <p>Data stays until you clear your browser storage or press Reset demo in the operator console. Shared demo state older than 15 minutes is ignored when the page loads.</p>,
        },
        {
          id: 'maps',
          title: 'Map data',
          body: (
            <p>
              Map data is from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, available under the Open Database License. Attribution is shown on every map.
            </p>
          ),
        },
        {
          id: 'contact',
          title: 'Contact',
          body: (
            <p>
              Questions about this policy: <a href="mailto:team@mediroute.example">team@mediroute.example</a> (placeholder address for the prototype team).
            </p>
          ),
        },
      ]}
    />
  )
}
