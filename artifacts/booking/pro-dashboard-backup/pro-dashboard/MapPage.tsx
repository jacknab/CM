import "leaflet/dist/leaflet.css";
import { useContext, useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { StoreContext } from "@/hooks/use-store";
import { Link } from "react-router-dom";
import {
  MapContainer, TileLayer, Marker, Popup, useMap,
} from "react-leaflet";
import L from "leaflet";
import {
  Plus, ChevronLeft, ChevronRight, Navigation2, Route,
  Satellite, Users, Clock, MapPin, Wrench, AlertTriangle,
  RefreshCw, Phone, ChevronRight as Chevron,
} from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  new: "#64748b", assigned: "#3b82f6", en_route: "#f59e0b",
  in_progress: "#00D4AA", completed: "#22c55e", cancelled: "#ef4444",
};
const STATUS_LABEL: Record<string, string> = {
  new: "New", assigned: "Assigned", en_route: "En Route",
  in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled",
};

function makeCrewIcon(color: string, initials: string) {
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:40px;height:40px;border-radius:50%;
        background:${color};
        border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:13px;color:white;
        font-family:'Plus Jakarta Sans',sans-serif;
        cursor:pointer;
      ">${initials}</div>
      <div style="
        width:0;height:0;
        border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:8px solid ${color};
        margin-left:14px;margin-top:-1px;
      "></div>
    `,
    iconSize: [40, 48],
    iconAnchor: [20, 48],
    popupAnchor: [0, -48],
  });
}

function makeJobIcon(color: string, status: string) {
  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:32px;height:40px;">
        <div style="
          width:32px;height:32px;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          background:${color};
          border:2px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,0.4);
        "></div>
        <div style="
          position:absolute;top:6px;left:6px;
          width:20px;height:20px;border-radius:50%;
          background:rgba(0,0,0,0.25);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="white">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
  });
}

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], map.getZoom()); }, [lat, lng]);
  return null;
}

function CrewCard({ crew, orders, onClose }: any) {
  const activeJob = orders.find((o: any) => o.crewId === crew.id &&
    (o.status === "in_progress" || o.status === "en_route"));
  const assignedJobs = orders.filter((o: any) => o.crewId === crew.id &&
    o.status !== "completed" && o.status !== "cancelled");

  return (
    <div className="flex flex-col h-full">
      {/* Crew header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
            style={{ background: crew.color || "#00D4AA" }}
          >
            {crew.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{crew.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-2 h-2 rounded-full ${crew.location ? "bg-green-400" : "bg-white/30"}`} />
              <span className="text-white/50 text-xs">
                {crew.location ? "GPS Active" : "No GPS signal"}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xs px-2 py-1 rounded hover:bg-white/10">✕</button>
        </div>
        {crew.location && (
          <p className="text-white/30 text-xs mt-2 font-mono">
            {parseFloat(crew.location.lat).toFixed(4)}, {parseFloat(crew.location.lng).toFixed(4)}
          </p>
        )}
      </div>

      {/* Active job */}
      {activeJob && (
        <div className="p-4 border-b border-white/10">
          <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-2">Active Job</p>
          <Link to={`/pro-dashboard/jobs/${activeJob.id}`}>
            <div className="bg-[#00D4AA]/10 border border-[#00D4AA]/20 rounded-xl p-3 hover:bg-[#00D4AA]/15 transition-colors cursor-pointer">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#00D4AA] text-xs font-bold">{activeJob.orderNumber}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: `${STATUS_COLOR[activeJob.status]}20`, color: STATUS_COLOR[activeJob.status] }}>
                  {STATUS_LABEL[activeJob.status]}
                </span>
              </div>
              <p className="text-white font-semibold text-sm">{activeJob.customerName}</p>
              <p className="text-white/50 text-xs truncate mt-0.5">{activeJob.serviceType}</p>
              {activeJob.address && (
                <div className="flex items-center gap-1 mt-2">
                  <MapPin className="w-3 h-3 text-white/30 flex-shrink-0" />
                  <span className="text-white/40 text-xs truncate">{activeJob.address}{activeJob.city ? `, ${activeJob.city}` : ""}</span>
                </div>
              )}
            </div>
          </Link>
        </div>
      )}

      {/* Job queue */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-3">
          Schedule ({assignedJobs.length} job{assignedJobs.length !== 1 ? "s" : ""})
        </p>
        {assignedJobs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/30 text-sm">No jobs assigned</p>
          </div>
        ) : (
          <div className="space-y-2">
            {assignedJobs.map((job: any) => (
              <Link key={job.id} to={`/pro-dashboard/jobs/${job.id}`}>
                <div className="bg-white/5 hover:bg-white/8 border border-white/8 rounded-xl p-3 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white/50 text-xs font-mono">{job.orderNumber}</span>
                    <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[job.status] }} />
                  </div>
                  <p className="text-white text-sm font-semibold truncate">{job.customerName}</p>
                  <p className="text-white/40 text-xs truncate">{job.serviceType}</p>
                  {job.scheduledAt && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Clock className="w-3 h-3 text-white/30" />
                      <span className="text-white/40 text-xs">
                        {new Date(job.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                  {job.overtimeFlagged && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3 h-3 text-yellow-400" />
                      <span className="text-yellow-400 text-xs font-semibold">Overtime</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MapPage() {
  const ctx = useContext(StoreContext);
  const storeId = ctx?.selectedStore?.id;

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedCrewIds, setSelectedCrewIds] = useState<number[]>([]);
  const [selectedCrew, setSelectedCrew] = useState<any>(null);
  const [showTrails, setShowTrails] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [satellite, setSatellite] = useState(false);
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.7392, -104.9903]);
  const [mapCenterKey, setMapCenterKey] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: dispatchData, isLoading, refetch } = useQuery({
    queryKey: ["/api/pro-dashboard/dispatch", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/dispatch?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!storeId,
    refetchInterval: 60000,
  });

  const crews: any[] = dispatchData?.crews ?? [];
  const orders: any[] = dispatchData?.orders ?? [];

  const crewsWithLocation = crews.filter(c => c.location?.lat && c.location?.lng);
  const ordersWithLocation = orders.filter(o => o.lat && o.lng);

  const visibleCrews = selectedCrewIds.length > 0
    ? crewsWithLocation.filter(c => selectedCrewIds.includes(c.id))
    : crewsWithLocation;

  const visibleOrders = selectedCrewIds.length > 0
    ? ordersWithLocation.filter(o => selectedCrewIds.includes(o.crewId))
    : ordersWithLocation;

  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d);
  };

  const toggleCrew = (id: number) => {
    setSelectedCrewIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    if (crewsWithLocation.length > 0 && !selectedCrew) {
      const first = crewsWithLocation[0];
      setMapCenter([parseFloat(first.location.lat), parseFloat(first.location.lng)]);
      setMapCenterKey(k => k + 1);
    }
  }, [crewsWithLocation.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const tileUrl = satellite
    ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  const tileAttr = satellite
    ? "Tiles &copy; Esri"
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';

  return (
    <div className="flex flex-col h-full bg-[#060E1A]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-[#0A1628] flex-shrink-0 flex-wrap">

        {/* New Job */}
        <Link to="/pro-dashboard/jobs/new">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00D4AA] text-[#050C18] text-xs font-bold hover:bg-[#00D4AA]/90 transition-colors flex-shrink-0">
            <Plus className="w-3.5 h-3.5" />
            New Job
          </button>
        </Link>

        <div className="w-px h-5 bg-white/10 flex-shrink-0" />

        {/* Show Trails */}
        <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
          <div
            onClick={() => setShowTrails(v => !v)}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${showTrails ? "bg-[#00D4AA] border-[#00D4AA]" : "border-white/30 bg-transparent"}`}
          >
            {showTrails && <svg className="w-2.5 h-2.5 text-[#050C18]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <Navigation2 className="w-3.5 h-3.5 text-white/50" />
          <span className="text-white/70 text-xs font-medium">Show Trails</span>
        </label>

        {/* Show Routes */}
        <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
          <div
            onClick={() => setShowRoutes(v => !v)}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${showRoutes ? "bg-[#00D4AA] border-[#00D4AA]" : "border-white/30 bg-transparent"}`}
          >
            {showRoutes && <svg className="w-2.5 h-2.5 text-[#050C18]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <Route className="w-3.5 h-3.5 text-white/50" />
          <span className="text-white/70 text-xs font-medium">Show Routes</span>
        </label>

        {/* Satellite */}
        <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
          <div
            onClick={() => setSatellite(v => !v)}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${satellite ? "bg-[#00D4AA] border-[#00D4AA]" : "border-white/30 bg-transparent"}`}
          >
            {satellite && <svg className="w-2.5 h-2.5 text-[#050C18]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <Satellite className="w-3.5 h-3.5 text-white/50" />
          <span className="text-white/70 text-xs font-medium">Satellite</span>
        </label>

        <div className="w-px h-5 bg-white/10 flex-shrink-0" />

        {/* Employee selector */}
        <div className="relative flex-shrink-0" ref={dropdownRef}>
          <button
            onClick={() => setEmployeeDropdownOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-white/70 text-xs font-medium transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            {selectedCrewIds.length === 0
              ? "All Employees"
              : `${selectedCrewIds.length} Selected`}
            <svg className="w-3 h-3 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>

          {employeeDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-52 bg-[#0D1F35] border border-white/15 rounded-xl shadow-2xl z-[9999] overflow-hidden">
              <div className="p-2">
                <button
                  onClick={() => { setSelectedCrewIds([]); setEmployeeDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-[#00D4AA] hover:bg-[#00D4AA]/10 transition-colors"
                >
                  Show All
                </button>
                {crews.map(crew => (
                  <label key={crew.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedCrewIds.includes(crew.id) ? "border-0" : "border-white/30 bg-transparent"}`}
                      style={selectedCrewIds.includes(crew.id) ? { background: crew.color || "#00D4AA" } : {}}
                      onClick={() => toggleCrew(crew.id)}
                    >
                      {selectedCrewIds.includes(crew.id) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                      style={{ background: crew.color || "#00D4AA" }}>
                      {crew.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-white/80 text-xs font-medium truncate">{crew.name}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0 ${crew.location ? "bg-green-400" : "bg-white/20"}`} />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          <button onClick={() => shiftDate(-1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-white/80 text-xs font-semibold px-2 min-w-[150px] text-center">{dateLabel}</span>
          <button onClick={() => shiftDate(1)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => refetch()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors ml-1"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Map + Panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* Map */}
        <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#060E1A]/80 z-[1000]">
              <div className="text-white/60 text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading map data…
              </div>
            </div>
          )}

          <MapContainer
            center={mapCenter}
            zoom={11}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            zoomControl={false}
          >
            <TileLayer url={tileUrl} attribution={tileAttr} />

            {mapCenterKey > 0 && <MapRecenter lat={mapCenter[0]} lng={mapCenter[1]} />}

            {/* Crew markers */}
            {visibleCrews.map(crew => {
              const lat = parseFloat(crew.location.lat);
              const lng = parseFloat(crew.location.lng);
              const initials = crew.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
              const icon = makeCrewIcon(crew.color || "#00D4AA", initials);
              return (
                <Marker
                  key={`crew-${crew.id}`}
                  position={[lat, lng]}
                  icon={icon}
                  eventHandlers={{
                    click: () => {
                      setSelectedCrew(crew);
                      setMapCenter([lat, lng]);
                    },
                  }}
                >
                  <Popup className="crew-popup">
                    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", minWidth: 140 }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#0D1F35" }}>{crew.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                        {orders.filter((o: any) => o.crewId === crew.id && o.status !== "completed" && o.status !== "cancelled").length} active jobs
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Job site markers */}
            {visibleOrders.map(order => {
              const lat = parseFloat(order.lat);
              const lng = parseFloat(order.lng);
              const color = STATUS_COLOR[order.status] ?? "#64748b";
              const icon = makeJobIcon(color, order.status);
              return (
                <Marker
                  key={`job-${order.id}`}
                  position={[lat, lng]}
                  icon={icon}
                >
                  <Popup>
                    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", minWidth: 160 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{order.orderNumber}</span>
                        <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99, background: `${color}20`, color, fontWeight: 700 }}>{STATUS_LABEL[order.status]}</span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: "#0D1F35" }}>{order.customerName}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{order.serviceType}</div>
                      {order.address && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{order.address}{order.city ? `, ${order.city}` : ""}</div>}
                      {order.crew && <div style={{ fontSize: 10, color: "#00D4AA", marginTop: 4, fontWeight: 700 }}>👷 {order.crew.name}</div>}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Stats overlay */}
          <div className="absolute bottom-4 left-4 z-[1000] flex gap-2">
            <div className="bg-[#0D1F35]/90 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-white text-xs font-semibold">{crewsWithLocation.length} crews tracked</span>
            </div>
            <div className="bg-[#0D1F35]/90 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
              <Wrench className="w-3 h-3 text-[#00D4AA]" />
              <span className="text-white text-xs font-semibold">{orders.filter(o => o.status === "in_progress").length} in progress</span>
            </div>
            {ordersWithLocation.length < orders.length && (
              <div className="bg-yellow-500/15 border border-yellow-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
                <MapPin className="w-3 h-3 text-yellow-400" />
                <span className="text-yellow-400 text-xs font-semibold">
                  {orders.length - ordersWithLocation.length} jobs missing GPS
                </span>
              </div>
            )}
          </div>

          {/* No data state */}
          {!isLoading && crewsWithLocation.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-[500] pointer-events-none">
              <div className="bg-[#0D1F35]/90 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center max-w-xs">
                <Navigation2 className="w-10 h-10 text-white/20 mx-auto mb-3" />
                <p className="text-white font-bold text-base mb-1">No Crew Locations</p>
                <p className="text-white/50 text-sm leading-relaxed">
                  Crew GPS positions will appear here once your crew members check in using the Certxa Crew mobile app.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-72 bg-[#0A1628] border-l border-white/10 flex flex-col flex-shrink-0 overflow-hidden">
          {selectedCrew ? (
            <CrewCard
              crew={selectedCrew}
              orders={orders}
              onClose={() => setSelectedCrew(null)}
            />
          ) : (
            <div className="flex flex-col h-full">
              {/* Panel header */}
              <div className="p-4 border-b border-white/10">
                <h2 className="text-white font-bold text-sm">Schedule</h2>
              </div>

              {/* All active jobs list or empty state */}
              {orders.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
                    <Users className="w-8 h-8 text-white/20" />
                  </div>
                  <p className="text-white/60 font-semibold text-sm mb-1">No employees selected</p>
                  <p className="text-white/30 text-xs leading-relaxed">
                    Click a crew member on the map to see their schedule and active job.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4">
                  <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-3">Active Jobs ({orders.length})</p>
                  <div className="space-y-2">
                    {orders.slice(0, 20).map((order: any) => (
                      <Link key={order.id} to={`/pro-dashboard/jobs/${order.id}`}>
                        <div className="bg-white/5 hover:bg-white/8 border border-white/8 rounded-xl p-3 transition-colors cursor-pointer">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white/50 text-[10px] font-mono">{order.orderNumber}</span>
                            <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[order.status] }} />
                          </div>
                          <p className="text-white text-xs font-semibold truncate">{order.customerName}</p>
                          <p className="text-white/40 text-[11px] truncate">{order.serviceType}</p>
                          {order.crew && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: order.crew.color || "#00D4AA" }} />
                              <span className="text-white/50 text-[10px] truncate">{order.crew.name}</span>
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Crew list */}
              {crews.length > 0 && (
                <div className="border-t border-white/10 p-4">
                  <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-2">Crew ({crews.length})</p>
                  <div className="space-y-1.5">
                    {crews.slice(0, 6).map(crew => (
                      <button
                        key={crew.id}
                        onClick={() => {
                          setSelectedCrew(crew);
                          if (crew.location) {
                            setMapCenter([parseFloat(crew.location.lat), parseFloat(crew.location.lng)]);
                            setMapCenterKey(k => k + 1);
                          }
                        }}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/8 transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ background: crew.color || "#00D4AA" }}>
                          {crew.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-white/80 text-xs font-medium flex-1 truncate">{crew.name}</span>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${crew.location ? "bg-green-400" : "bg-white/15"}`} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
