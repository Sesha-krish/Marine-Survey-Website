// Port / terminal / ICD gazetteer — searched before free text so locations resolve to real sites.
export type Place = { name: string; city: string; state: string; country: string; lat: number; lng: number; kind: "PORT" | "TERMINAL" | "ICD" | "CFS" };

export const PLACES: Place[] = [
  { name: "Chennai Port", city: "Chennai", state: "Tamil Nadu", country: "IN", lat: 13.0975, lng: 80.2954, kind: "PORT" },
  { name: "Kamarajar Port (Ennore)", city: "Chennai", state: "Tamil Nadu", country: "IN", lat: 13.2647, lng: 80.3305, kind: "PORT" },
  { name: "Kattupalli Port", city: "Chennai", state: "Tamil Nadu", country: "IN", lat: 13.3089, lng: 80.3436, kind: "PORT" },
  { name: "V.O. Chidambaranar Port (Tuticorin)", city: "Thoothukudi", state: "Tamil Nadu", country: "IN", lat: 8.7642, lng: 78.1972, kind: "PORT" },
  { name: "Chennai Container Terminal (CCTL)", city: "Chennai", state: "Tamil Nadu", country: "IN", lat: 13.1009, lng: 80.2967, kind: "TERMINAL" },
  { name: "Chennai International Terminals (CITPL)", city: "Chennai", state: "Tamil Nadu", country: "IN", lat: 13.1105, lng: 80.2978, kind: "TERMINAL" },
  { name: "ICD Irungattukottai", city: "Sriperumbudur", state: "Tamil Nadu", country: "IN", lat: 12.9716, lng: 79.9886, kind: "ICD" },
  { name: "Madurai ICD", city: "Madurai", state: "Tamil Nadu", country: "IN", lat: 9.9252, lng: 78.1198, kind: "ICD" },
  { name: "Cochin Port", city: "Kochi", state: "Kerala", country: "IN", lat: 9.9658, lng: 76.2673, kind: "PORT" },
  { name: "ICTT Vallarpadam", city: "Kochi", state: "Kerala", country: "IN", lat: 9.9905, lng: 76.2588, kind: "TERMINAL" },
  { name: "Vizhinjam International Seaport", city: "Thiruvananthapuram", state: "Kerala", country: "IN", lat: 8.3794, lng: 76.9887, kind: "PORT" },
  { name: "New Mangalore Port", city: "Mangaluru", state: "Karnataka", country: "IN", lat: 12.9256, lng: 74.8121, kind: "PORT" },
  { name: "ICD Whitefield", city: "Bengaluru", state: "Karnataka", country: "IN", lat: 12.9889, lng: 77.7369, kind: "ICD" },
  { name: "Visakhapatnam Port", city: "Visakhapatnam", state: "Andhra Pradesh", country: "IN", lat: 17.6927, lng: 83.2909, kind: "PORT" },
  { name: "Krishnapatnam Port", city: "Nellore", state: "Andhra Pradesh", country: "IN", lat: 14.2522, lng: 80.1189, kind: "PORT" },
  { name: "Paradip Port", city: "Paradip", state: "Odisha", country: "IN", lat: 20.2649, lng: 86.6705, kind: "PORT" },
  { name: "Haldia Dock Complex", city: "Haldia", state: "West Bengal", country: "IN", lat: 22.0257, lng: 88.0583, kind: "PORT" },
  { name: "Syama Prasad Mookerjee Port (Kolkata)", city: "Kolkata", state: "West Bengal", country: "IN", lat: 22.5463, lng: 88.3113, kind: "PORT" },
  { name: "Jawaharlal Nehru Port (Nhava Sheva)", city: "Navi Mumbai", state: "Maharashtra", country: "IN", lat: 18.9497, lng: 72.9512, kind: "PORT" },
  { name: "Mumbai Port", city: "Mumbai", state: "Maharashtra", country: "IN", lat: 18.9388, lng: 72.8426, kind: "PORT" },
  { name: "ICD Tughlakabad", city: "New Delhi", state: "Delhi", country: "IN", lat: 28.4994, lng: 77.2804, kind: "ICD" },
  { name: "Mundra Port", city: "Mundra", state: "Gujarat", country: "IN", lat: 22.7397, lng: 69.7051, kind: "PORT" },
  { name: "Deendayal Port (Kandla)", city: "Kandla", state: "Gujarat", country: "IN", lat: 23.0333, lng: 70.2167, kind: "PORT" },
  { name: "Hazira Port", city: "Surat", state: "Gujarat", country: "IN", lat: 21.0819, lng: 72.6347, kind: "PORT" },
  { name: "Pipavav Port", city: "Amreli", state: "Gujarat", country: "IN", lat: 20.9167, lng: 71.5167, kind: "PORT" },
  { name: "Mormugao Port", city: "Vasco da Gama", state: "Goa", country: "IN", lat: 15.4136, lng: 73.7997, kind: "PORT" },
  { name: "Port of Colombo", city: "Colombo", state: "Western", country: "LK", lat: 6.9497, lng: 79.8428, kind: "PORT" },
  { name: "Port of Singapore (Tanjong Pagar)", city: "Singapore", state: "Singapore", country: "SG", lat: 1.2644, lng: 103.84, kind: "PORT" },
  { name: "Jebel Ali Port", city: "Dubai", state: "Dubai", country: "AE", lat: 25.0112, lng: 55.0616, kind: "PORT" },
];

export function searchPlaces(q: string, limit = 8) {
  const s = q.trim().toLowerCase();
  if (!s) return PLACES.slice(0, limit);
  return PLACES.filter((p) => `${p.name} ${p.city} ${p.state}`.toLowerCase().includes(s)).slice(0, limit);
}
