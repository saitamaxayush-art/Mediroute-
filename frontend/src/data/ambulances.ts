import type { Ambulance } from '../types'

/** Sample fleet. Positions are real Pune streets. */
export const AMBULANCES: Ambulance[] = [
  { id: 'BLS-01', type: 'BLS', lat: 18.534, lng: 73.824, status: 'available', base: 'Pashan Road' },
  { id: 'ALS-02', type: 'ALS', lat: 18.505, lng: 73.815, status: 'available', base: 'Kothrud Depot' },
  { id: 'ALS-03', type: 'ALS', lat: 18.528, lng: 73.84, status: 'available', base: 'Model Colony' },
  { id: 'BLS-04', type: 'BLS', lat: 18.566, lng: 73.91, status: 'available', base: 'Viman Nagar' },
  { id: 'ALS-05', type: 'ALS', lat: 18.507, lng: 73.925, status: 'available', base: 'Hadapsar' },
]
