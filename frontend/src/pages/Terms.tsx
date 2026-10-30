import { LegalPage } from './Legal'

export default function Terms() {
  return (
    <LegalPage
      label="Terms"
      title="Terms and Conditions"
      metaTitle="Terms and Conditions | MediRoute"
      metaDesc="Terms for using the MediRoute hackathon prototype, which runs on sample data."
      intro="By using this prototype you agree to these terms. They are short because the prototype is simple: it is a demonstration on sample data, and nothing more."
      sections={[
        {
          id: 'prototype',
          title: 'A hackathon prototype',
          body: <p>MediRoute was built for the Geek Fiesta '26 Ideathon. Every hospital, bed count, ambulance and trip shown is sample data or a simulation.</p>,
        },
        {
          id: 'medical',
          title: 'Not a medical device',
          body: (
            <>
              <p>MediRoute is not a medical device. It does not replace clinical judgement, and it does not replace official 112 or 108 emergency procedures.</p>
              <p>In a real emergency, call 112.</p>
            </>
          ),
        },
        {
          id: 'signals',
          title: 'Signal control is simulated',
          body: <p>The green corridor is a simulation. The prototype is not connected to any real traffic signal, traffic control centre or police system.</p>,
        },
        {
          id: 'hospitals',
          title: 'Hospital names are fictional',
          body: <p>Hospital names are made up. They are placed at real Pune locations only so the routes run on real roads. Any likeness to a real hospital is unintended.</p>,
        },
        {
          id: 'warranty',
          title: 'No warranty',
          body: <p>The prototype is provided as it is, without warranty of any kind. The team is not liable for any loss from its use.</p>,
        },
        {
          id: 'use',
          title: 'Acceptable use',
          body: (
            <ul>
              <li>Use it to explore and evaluate the idea.</li>
              <li>Do not enter real patient data.</li>
              <li>Do not send automated or bulk requests to the public routing service through it.</li>
              <li>Do not present it as a working emergency service.</li>
            </ul>
          ),
        },
        {
          id: 'licences',
          title: 'Map and routing data licences',
          body: (
            <ul>
              <li>
                Map data: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, Open Database License (ODbL).
              </li>
              <li>
                Vector tiles and style: <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>, with OpenMapTiles. Fallback raster tiles: CARTO.
              </li>
              <li>
                Routing: <a href="https://project-osrm.org" target="_blank" rel="noreferrer">OSRM</a> public demo server, under its usage policy.
              </li>
            </ul>
          ),
        },
      ]}
    />
  )
}
