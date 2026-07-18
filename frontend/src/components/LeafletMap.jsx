import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Fix Leaflet default icon broken paths with Vite ──────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const makeIcon = (color) => new L.Icon({
    iconUrl:     `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl:   'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize:    [25, 41],
    iconAnchor:  [12, 41],
    popupAnchor: [1, -34],
});

const icons = {
    blue:   makeIcon('blue'),
    red:    makeIcon('red'),
    green:  makeIcon('green'),
    orange: makeIcon('orange'),
};

/* ── Guard: returns true only if [lat, lng] are both finite numbers ── */
const isValidLatLng = (pos) =>
    Array.isArray(pos) &&
    pos.length === 2 &&
    typeof pos[0] === 'number' && isFinite(pos[0]) &&
    typeof pos[1] === 'number' && isFinite(pos[1]);

/* ── Guard: returns [lat, lng] from GeoJSON [lng, lat] or null ── */
const toLL = (geoJsonCoord) => {
    if (!Array.isArray(geoJsonCoord) || geoJsonCoord.length < 2) return null;
    const lat = geoJsonCoord[1];
    const lng = geoJsonCoord[0];
    if (typeof lat !== 'number' || !isFinite(lat)) return null;
    if (typeof lng !== 'number' || !isFinite(lng)) return null;
    return [lat, lng];
};

/* ── Guard: returns [lat, lng] from { lat, lng } or null ── */
const objToLL = (pos) => {
    if (!pos || typeof pos.lat !== 'number' || typeof pos.lng !== 'number') return null;
    if (!isFinite(pos.lat) || !isFinite(pos.lng)) return null;
    return [pos.lat, pos.lng];
};

/* ── Map Click Handler for Interactive Location Picking ───── */
const MapClickHandler = ({ onMapClick }) => {
    useMapEvents({
        click(e) {
            if (onMapClick) onMapClick([e.latlng.lng, e.latlng.lat]); // Return GeoJSON [lng, lat]
        },
    });
    return null;
};

/* ── Auto-pan smoothly when primary position changes ─────────── */
const SmartPan = ({ position }) => {
    const map  = useMap();
    const prev = useRef(null);
    useEffect(() => {
        if (!isValidLatLng(position)) return;
        const key = position.join(',');
        if (key !== prev.current) {
            map.setView(position, map.getZoom(), { animate: true });
            prev.current = key;
        }
    }, [position, map]);
    return null;
};

/* ── Fit map to show all markers ─────────────────────────────── */
const FitBounds = ({ points }) => {
    const map = useMap();
    useEffect(() => {
        const valid = points.filter(isValidLatLng);
        if (valid.length >= 2) {
            try {
                map.fitBounds(L.latLngBounds(valid), { padding: [40, 40] });
            } catch (_) { /* ignore if bounds invalid */ }
        }
    }, [points, map]);
    return null;
};

/* ── Fetch an OSRM route — returns { coords, distanceM, durationS } ── */
const fetchOSRMRoute = async (from, to) => {
    // from/to must be valid GeoJSON [lng, lat] pairs
    if (!Array.isArray(from) || !Array.isArray(to)) return null;
    const [lng1, lat1] = from;
    const [lng2, lat2] = to;
    if (!isFinite(lng1) || !isFinite(lat1) || !isFinite(lng2) || !isFinite(lat2)) return null;
    
    // Prevent invalid OSRM routing queries to 0,0 (Null Island) which return 400 Bad Request
    if ((lng1 === 0 && lat1 === 0) || (lng2 === 0 && lat2 === 0)) return null;

    const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
    try {
        const res  = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes?.length) return null;
        const route  = data.routes[0];
        const coords = route.geometry.coordinates
            .map(([lng, lat]) => [lat, lng])
            .filter(isValidLatLng);
        return {
            coords,
            distanceM: route.legs[0].distance,
            durationS: route.legs[0].duration,
        };
    } catch {
        return null;
    }
};

/**
 * LeafletMap — Reusable OpenStreetMap + OSRM routing component
 *
 * Props
 * ─────
 * center      [lat, lng]           – initial / fallback center
 * zoom        number               – initial zoom (default 13)
 * driverPos   { lat, lng } | null  – live driver marker (blue)
 * myPos       { lat, lng } | null  – passenger / self marker (red)
 * pickupPos   [lng, lat]  | null   – pickup marker (green)  GeoJSON order
 * destPos     [lng, lat]  | null   – dest marker (orange)   GeoJSON order
 * pickupLabel string
 * destLabel   string
 * height      string               – css height (default "100%")
 * showRoute   bool                 – draw OSRM route
 * onRouteInfo fn({ distanceM, durationS })
 * onMapClick  fn([lng, lat])       – called on map click for interactive selection
 */
const LeafletMap = ({
    center      = [11.0168, 76.9558],
    zoom        = 13,
    driverPos   = null,
    myPos       = null,
    pickupPos   = null,
    destPos     = null,
    pickupLabel = 'Pickup',
    destLabel   = 'Destination',
    height      = '100%',
    showRoute   = true,
    onRouteInfo = null,
    onMapClick  = null,
}) => {
    const [mainRoute,   setMainRoute]   = useState(null);
    const [driverRoute, setDriverRoute] = useState(null);

    const pickupLL = toLL(pickupPos);
    const destLL   = toLL(destPos);
    const driverLL = objToLL(driverPos);
    const myLL     = objToLL(myPos);
    const safeCenter = isValidLatLng(center) ? center : [11.0168, 76.9558];

    /* ── OSRM: pickup → destination route ────────────────────── */
    useEffect(() => {
        if (!showRoute || !pickupLL || !destLL) { setMainRoute(null); return; }
        let cancelled = false;
        // Convert back to GeoJSON order [lng, lat] for OSRM
        fetchOSRMRoute([pickupLL[1], pickupLL[0]], [destLL[1], destLL[0]]).then(result => {
            if (cancelled) return;
            setMainRoute(result);
            if (result && onRouteInfo) onRouteInfo({ distanceM: result.distanceM, durationS: result.durationS });
        });
        return () => { cancelled = true; };
    // Only re-run when distinct pickup/dest coords change
    }, [
        pickupLL ? pickupLL.join(',') : null,
        destLL   ? destLL.join(',')   : null,
        showRoute
    ]);

    /* ── OSRM: driver → pickup (approach route) ──────────────── */
    useEffect(() => {
        if (!driverLL || !pickupLL) { setDriverRoute(null); return; }
        let cancelled = false;
        fetchOSRMRoute([driverLL[1], driverLL[0]], [pickupLL[1], pickupLL[0]]).then(result => {
            if (!cancelled) setDriverRoute(result);
        });
        return () => { cancelled = true; };
    }, [
        driverLL ? `${driverLL[0].toFixed(4)},${driverLL[1].toFixed(4)}` : null,
        pickupLL ? pickupLL.join(',') : null,
    ]);

    /* ── Bounds & pan helpers ─────────────────────────────────── */
    const boundsPoints = [pickupLL, destLL, driverLL, myLL].filter(isValidLatLng);
    const panTarget    = driverLL || myLL || pickupLL;

    return (
        <MapContainer
            center={safeCenter}
            zoom={zoom}
            style={{ height, width: '100%' }}
            className="z-0"
        >
            <MapClickHandler onMapClick={onMapClick} />
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {boundsPoints.length >= 2 && <FitBounds points={boundsPoints} />}
            {boundsPoints.length === 1 && isValidLatLng(panTarget) && <SmartPan position={panTarget} />}

            {/* Main route: pickup → destination (green solid) */}
            {mainRoute?.coords?.length > 1 && (
                <Polyline
                    positions={mainRoute.coords}
                    pathOptions={{ color: '#16a34a', weight: 5, opacity: 0.85 }}
                />
            )}

            {/* Driver approach route (blue dashed) */}
            {driverRoute?.coords?.length > 1 && (
                <Polyline
                    positions={driverRoute.coords}
                    pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.75, dashArray: '8 6' }}
                />
            )}

            {pickupLL && (
                <Marker position={pickupLL} icon={icons.green}>
                    <Popup><strong>🟢 {pickupLabel}</strong></Popup>
                </Marker>
            )}

            {destLL && (
                <Marker position={destLL} icon={icons.orange}>
                    <Popup><strong>🟠 {destLabel}</strong></Popup>
                </Marker>
            )}

            {driverLL && (
                <Marker position={driverLL} icon={icons.blue}>
                    <Popup><strong>🚗 Driver</strong></Popup>
                </Marker>
            )}

            {myLL && (
                <Marker position={myLL} icon={icons.red}>
                    <Popup><strong>📍 You</strong></Popup>
                </Marker>
            )}
        </MapContainer>
    );
};

export default LeafletMap;
