import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, remove } from 'firebase/database';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyCDKuWMo7gg9auLWODnM8oO2ygEyaLGLkU",
  authDomain: "ju-bus-tracker-5f5b6.firebaseapp.com",
  databaseURL: "https://ju-bus-tracker-5f5b6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ju-bus-tracker-5f5b6",
  storageBucket: "ju-bus-tracker-5f5b6.appspot.com",
  messagingSenderId: "2844986643",
  appId: "1:2844986643:web:1e3aca7110879527011ee6"
};

// --- Google Maps API Key ---
const GOOGLE_MAPS_API_KEY = "AIzaSyBZ2R4DcMPLALYrdDQkLjlc6ZbpXxm6IcQ";

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Bus Schedule Data (NOW IN AM/PM FORMAT) ---
const busSchedule = {
    weekday: { // Sunday-Thursday
        "Campus → Bongobazar": ["6:45 AM", "3:00 PM", "5:00 PM", "8:00 PM"],
        "Bongobazar → Campus": ["5:00 PM", "6:00 PM", "7:30 PM", "8:30 PM"]
    },
    weekend: { // Friday-Saturday
        "Campus → Bongobazar": ["9:30 AM", "4:00 PM"],
        "Bongobazar → Campus": ["2:15 PM", "6:00 PM", "7:30 PM", "8:30 PM"]
    }
};

// --- Helper to get active trips ---
const getActiveTrips = () => {
    const now = new Date();
    const day = now.getDay(); // 0=Sunday, 5=Friday, 6=Saturday
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
    const isWeekend = (day === 5 || day === 6);
    const schedule = isWeekend ? busSchedule.weekend : busSchedule.weekday;
    const activeTrips = [];

    for (const direction in schedule) {
        schedule[direction].forEach(time => {
            const [timePart, meridian] = time.split(' ');
            let [hours, minutes] = timePart.split(':').map(Number);
            if (meridian === 'PM' && hours !== 12) hours += 12;
            if (meridian === 'AM' && hours === 12) hours = 0;
            
            const departureTimeInMinutes = hours * 60 + minutes;
            const tripEndTimeInMinutes = departureTimeInMinutes + 90; 

            if (currentTimeInMinutes >= departureTimeInMinutes && currentTimeInMinutes <= tripEndTimeInMinutes) {
                const tripId = `${now.toISOString().split('T')[0]}_${time.replace(/[:\s]/g, '')}_${direction.charAt(0)}`;
                activeTrips.push({ id: tripId, time: time, direction: direction });
            }
        });
    }
    return activeTrips;
};

// --- Main App Component ---
export default function App() {
  const [activeBusLocations, setActiveBusLocations] = useState({});
  const [isSharing, setIsSharing] = useState(false);
  const [sharingTripId, setSharingTripId] = useState(null);
  const [sharingTripTime, setSharingTripTime] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [modal, setModal] = useState({ title: '', message: '', type: null });
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showTripSelector, setShowTripSelector] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [announcementInput, setAnnouncementInput] = useState('');
  const [currentPage, setCurrentPage] = useState('map'); // NEW: Page state
  const [showNavMenu, setShowNavMenu] = useState(false); // NEW: Nav menu state
  const watchId = useRef(null);
  const sharingTimeout = useRef(null);

  const ACTIVE_TRIPS_PATH = 'active_trips';
  const ANNOUNCEMENT_PATH = 'announcement';

  useEffect(() => {
    const activeTripsRef = ref(db, ACTIVE_TRIPS_PATH);
    const announcementRef = ref(db, ANNOUNCEMENT_PATH);
    const unsubscribeTrips = onValue(activeTripsRef, (snapshot) => setActiveBusLocations(snapshot.val() || {}));
    const unsubscribeAnnouncements = onValue(announcementRef, (snapshot) => setAnnouncement(snapshot.val()?.message || ''));
    return () => { unsubscribeTrips(); unsubscribeAnnouncements(); };
  }, []);

  const startSharingLocation = (trip) => {
    setShowTripSelector(false);
    if (!navigator.geolocation) {
      setModal({ title: 'Error', message: 'Geolocation is not supported.', type: 'alert' });
      return;
    }
    const tripLocationRef = ref(db, `${ACTIVE_TRIPS_PATH}/${trip.id}`);
    setIsSharing(true);
    setSharingTripId(trip.id);
    setSharingTripTime(trip.time);
    sharingTimeout.current = setTimeout(() => stopSharingLocation(true), 90 * 60 * 1000);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        set(tripLocationRef, { ...trip, location: { lat: latitude, lng: longitude, timestamp: Date.now() } })
          .catch(error => { console.error("Firebase write error:", error); setModal({ title: 'Database Error', message: 'Could not save location.', type: 'alert'}); stopSharingLocation(); });
      },
      (error) => { console.error("Geolocation Error:", error); setModal({ title: 'Location Error', message: "Could not get your location. Please enable location services.", type: 'alert' }); stopSharingLocation(); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const stopSharingLocation = (isTimeout = false) => {
    if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    if (sharingTimeout.current) clearTimeout(sharingTimeout.current);
    if(sharingTripId) remove(ref(db, `${ACTIVE_TRIPS_PATH}/${sharingTripId}`));
    watchId.current = null;
    sharingTimeout.current = null;
    setIsSharing(false);
    setSharingTripId(null);
    setSharingTripTime('');
    if (isTimeout) setModal({ title: 'Sharing Stopped', message: 'Location sharing has automatically stopped after 90 minutes.', type: 'alert' });
  };

  const handleShareButtonClick = () => {
    if (isSharing) stopSharingLocation();
    else setModal({ title: 'Are you on the bus?', message: "To keep the map accurate, please only share your location if you are currently on a university bus.", type: 'confirm', onConfirm: () => setShowTripSelector(true) });
  };
  
  const handleResetLocation = () => setModal({ title: 'Confirm Reset', message: 'Are you sure you want to clear ALL active bus locations?', type: 'confirm', onConfirm: () => remove(ref(db, ACTIVE_TRIPS_PATH)).then(() => { setActiveBusLocations({}); setModal({ title: 'Success', message: 'All locations cleared.', type: 'alert' }); }).catch((error) => { console.error("Reset locations error:", error); setModal({ title: 'Error', message: 'Failed to reset locations.', type: 'alert' }); }) });
  
  const toggleAdminView = () => isAdmin ? setIsAdmin(false) : setShowPasswordPrompt(true);
  const handlePasswordSubmit = (password) => {
    setShowPasswordPrompt(false);
    if (password === "juadmin") setIsAdmin(true);
    else setModal({ title: 'Access Denied', message: 'Incorrect password.', type: 'alert' });
  };
    
  const handlePublishAnnouncement = () => {
      if (!announcementInput.trim()) { setModal({ title: 'Empty Message', message: 'Please write an announcement before publishing.', type: 'alert' }); return; }
      set(ref(db, ANNOUNCEMENT_PATH), { message: announcementInput, timestamp: Date.now() })
        .then(() => setAnnouncementInput(''))
        .catch(err => { console.error("Announcement publish error:", err); setModal({ title: 'Error', message: 'Could not publish announcement.', type: 'alert' }); });
  };
    
  const handleClearAnnouncement = () => set(ref(db, ANNOUNCEMENT_PATH), { message: '', timestamp: Date.now() }).catch(err => { console.error("Announcement clear error:", err); setModal({ title: 'Error', message: 'Could not clear announcement.', type: 'alert' }); });

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col items-center text-gray-800">
      <header className="w-full bg-green-700 text-white p-4 shadow-md sticky top-0 z-30 flex justify-between items-center">
        {/* Left Icon */}
        <button onClick={() => setShowNavMenu(true)} className="p-2 rounded-md hover:bg-white/20 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        
        {/* Centered Title */}
        <div className="text-center">
            <h1 className="text-xl sm:text-2xl font-bold">JU Bus Tracker</h1>
            <p className="text-xs sm:text-sm -mt-1 capitalize">{currentPage.replace('-', ' ')}</p>
        </div>

        {/* Right Button */}
        <button onClick={() => setShowSchedule(true)} className="bg-white/20 hover:bg-white/30 text-white font-bold py-2 px-2 sm:px-4 rounded-lg flex items-center transition-colors text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
            <span className="hidden sm:inline">Schedule</span>
        </button>
      </header>

      <NavigationMenu 
        showNavMenu={showNavMenu} 
        setShowNavMenu={setShowNavMenu} 
        setCurrentPage={setCurrentPage}
      />
      
      <main className="w-full max-w-4xl p-4 flex-grow">
        {announcement && announcement.trim() !== '' && (
            <div className="bg-yellow-200 border-l-4 border-yellow-500 text-yellow-800 p-4 mb-4 rounded-lg shadow-md" role="alert">
                <p className="font-bold">Announcement</p>
                <p>{announcement}</p>
            </div>
        )}
        
        {currentPage === 'map' && (
            <>
                <div className="w-full h-96 bg-gray-300 rounded-lg shadow-lg mb-6 relative overflow-hidden"><GoogleMapComponent busLocations={activeBusLocations} /></div>
                <div className="bg-white p-6 rounded-lg shadow-lg text-center">
                    <h2 className="text-xl font-semibold mb-2">Are you on the bus?</h2>
                    <p className="text-gray-600 mb-4">Help fellow students by sharing the bus's location.</p>
                    <button onClick={handleShareButtonClick} className={`px-8 py-3 rounded-full font-bold text-white transition-all duration-300 transform hover:scale-105 ${isSharing ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}>{isSharing ? `Stop Sharing (${sharingTripTime})` : 'Share My Location'}</button>
                    {isSharing && <p className="text-sm text-green-600 mt-2 animate-pulse">Sharing your location live...</p>}
                </div>
            </>
        )}

        {currentPage === 'how-to-use' && <HowToUsePage />}
        {currentPage === 'about' && <AboutPage />}
        {currentPage === 'contact' && <ContactPage />}
        {currentPage === 'hear-radio' && <RadioPage />} 
        
        {isAdmin && (
             <div className="mt-6 bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-center">Admin Panel</h2>
                <div className="flex flex-col items-center space-y-4">
                    <h3 className="text-lg font-medium">Manage Announcements</h3>
                    <textarea value={announcementInput} onChange={(e) => setAnnouncementInput(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md" placeholder="Type announcement here..."></textarea>
                    <div className="flex space-x-4"><button onClick={handlePublishAnnouncement} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">Publish</button><button onClick={handleClearAnnouncement} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded">Clear</button></div>
                    <hr className="w-full my-4" /><h3 className="text-lg font-medium">Manage Bus Data</h3><button onClick={handleResetLocation} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded">Reset ALL Locations</button>
                </div>
            </div>
        )}
      </main>

       <footer className="w-full p-4 text-center text-xs text-gray-600"><p>&copy; {new Date().getFullYear()} JU Bus Tracker.</p><button onClick={toggleAdminView} className="text-blue-500 hover:underline mt-2">{isAdmin ? 'Exit Admin Mode' : 'Admin Access'}</button></footer>
       <Modal modalConfig={modal} closeModal={() => setModal({ title: '', message: '', type: null })} />
       {showPasswordPrompt && <PasswordPrompt onConfirm={handlePasswordSubmit} onCancel={() => setShowPasswordPrompt(false)} />}
       {showSchedule && <ScheduleModal onClose={() => setShowSchedule(false)} />}
       {showTripSelector && <TripSelectorModal onSelect={startSharingLocation} onClose={() => setShowTripSelector(false)} />}
    </div>
  );
}

// --- Navigation, Pages, and Map Components ---

const NavigationMenu = ({ showNavMenu, setShowNavMenu, setCurrentPage }) => {
    const navigate = (page) => {
        setCurrentPage(page);
        setShowNavMenu(false);
    };

    return (
        <>
            <div className={`fixed inset-0 bg-black/60 z-40 transition-opacity ${showNavMenu ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setShowNavMenu(false)}></div>
            <div className={`fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transform transition-transform ${showNavMenu ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-4 border-b">
                    <h2 className="text-xl font-bold text-green-700">Menu</h2>
                </div>
                <nav className="p-4 flex flex-col space-y-2">
                    <button onClick={() => navigate('map')} className="text-left p-2 rounded hover:bg-gray-100 transition-colors">Live Map</button>
                    <button onClick={() => navigate('hear-radio')} className="text-left p-2 rounded hover:bg-gray-100 transition-colors">Hear Radio</button>
                    <button onClick={() => navigate('how-to-use')} className="text-left p-2 rounded hover:bg-gray-100 transition-colors">How to Use</button>
                    <button onClick={() => navigate('about')} className="text-left p-2 rounded hover:bg-gray-100 transition-colors">About This Project</button>
                    <button onClick={() => navigate('contact')} className="text-left p-2 rounded hover:bg-gray-100 transition-colors">Contact</button>
                </nav>
            </div>
        </>
    );
};

const PageCard = ({ title, children }) => (
    <div className="bg-white p-6 rounded-lg shadow-lg animate-fade-in">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">{title}</h2>
        <div className="text-gray-700 space-y-4">
            {children}
        </div>
    </div>
);

const HowToUsePage = () => (
    <PageCard title="How to Use">
        <p>This tool is designed to be simple. Here’s how it works:</p>
        <ul className="list-decimal list-inside space-y-2 pl-4">
            <li><b>View the Map:</b> The main page shows a live map with the current location of active buses.</li>
            <li><b>Share Your Location:</b> If you are on a bus, click the "Share My Location" button. This helps everyone see where the bus is.</li>
            <li><b>Check the Schedule:</b> Click the "Schedule" button in the top-right corner to see all departure times.</li>
            <li><b>Listen to Radio:</b> Open the menu and go to "Hear Radio" to listen to live FM stations.</li>
        </ul>
    </PageCard>
);

const AboutPage = () => (
    <PageCard title="About This Project">
        <p>This project was created to solve a simple problem for the students of Jahangirnagar University: the frustration of not knowing when the next bus will arrive.</p>
        <p>By using crowdsourced, real-time location data, this tool aims to make the campus transportation system more predictable and less stressful for everyone.</p>
        <p><b>Your Name Here:</b> Feel free to add a paragraph about yourself, your department, and your motivation for building this amazing tool!</p>
    </PageCard>
);

const ContactPage = () => (
    <PageCard title="Contact">
        <p>Have questions, suggestions, or want to contribute to this project? Get in touch!</p>
        <p>Please replace the placeholder text below with your actual contact information.</p>
        <ul className="list-disc list-inside space-y-2 pl-4">
            <li><b>Email:</b> your.email@example.com</li>
            <li><b>LinkedIn:</b> linkedin.com/in/yourprofile</li>
            <li><b>GitHub:</b> github.com/yourusername</li>
        </ul>
    </PageCard>
);

const RadioPage = () => {
    const PRESET_STATIONS = [
        { name: "Radio Foorti 88.0 FM", url: "http://103.253.46.134:8000/stream" },
        { name: "ABC Radio 89.2 FM", url: "http://ample-zeno-03.radio-zeno.com/gfts02123qruv" },
        { name: "Radio Today 89.6 FM", url: "https://stream.zeno.fm/s428z2y292quv" },
    ];
    const [stations, setStations] = useState(PRESET_STATIONS);
    const [currentStation, setCurrentStation] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);

    const togglePlayPause = (station) => {
        if (currentStation && currentStation.url === station.url) {
            if (isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
            } else {
                audioRef.current.play();
                setIsPlaying(true);
            }
        } else {
            setCurrentStation(station);
            setIsPlaying(true);
        }
    };

    useEffect(() => {
        if (currentStation && audioRef.current) {
            audioRef.current.src = currentStation.url;
            audioRef.current.play().catch(error => {
                console.error("Audio play error:", error);
                setIsPlaying(false);
            });
        }
    }, [currentStation]);
    
    return (
        <PageCard title="Hear Radio">
            <p>Listen to live FM radio stations from Bangladesh while you wait.</p>
            <div className="mt-4">
                {/* Hidden Audio Player */}
                <audio ref={audioRef} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} crossOrigin="anonymous"></audio>
                
                {/* Station List */}
                <div className="space-y-2">
                    {stations.map(station => (
                        <div key={station.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <span className="font-medium text-gray-800">{station.name}</span>
                            <button onClick={() => togglePlayPause(station)} className="w-12 h-12 flex items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50">
                                {isPlaying && currentStation?.url === station.url ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                )}
                            </button>
                        </div>
                    ))}
                </div>
                {currentStation && (
                    <div className="mt-6 text-center p-4 bg-green-100 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-700">Currently Playing:</p>
                        <p className="font-bold text-green-800">{currentStation.name}</p>
                    </div>
                )}
            </div>
        </PageCard>
    );
};

const GoogleMapComponent = ({ busLocations }) => {
  const mapDivRef = useRef(null);
  const mapInstance = useRef(null);
  const markers = useRef({});
  const [isApiLoaded, setApiLoaded] = useState(false);

  useEffect(() => {
    if (window.google && window.google.maps) { setApiLoaded(true); return; }
    if (document.getElementById('google-maps-script')) return;
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initMap`;
    script.async = true; script.defer = true;
    window.initMap = () => document.dispatchEvent(new Event('google-maps-api-loaded'));
    const onApiLoad = () => setApiLoaded(true);
    document.addEventListener('google-maps-api-loaded', onApiLoad);
    document.head.appendChild(script);
    return () => document.removeEventListener('google-maps-api-loaded', onApiLoad);
  }, []);

  useEffect(() => {
    if (isApiLoaded && mapDivRef.current && !mapInstance.current) {
      mapInstance.current = new window.google.maps.Map(mapDivRef.current, { center: { lat: 23.81, lng: 90.33 }, zoom: 12, disableDefaultUI: true, zoomControl: true, mapId: "1c2f6d2f7f2868a" });
      const routeLabelDiv = document.createElement('div');
      Object.assign(routeLabelDiv.style, { backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,.15)', margin: '10px', padding: '8px 12px', textAlign: 'center' });
      routeLabelDiv.innerHTML = '<div style="font-size: 16px; font-weight: bold; color: #333; margin: 0;">Campus ↔ Bongobazar</div>';
      mapInstance.current.controls[window.google.maps.ControlPosition.TOP_CENTER].push(routeLabelDiv);
      new window.google.maps.Polyline({ path: ROUTE_PATH, geodesic: true, strokeColor: '#4285F4', strokeOpacity: 0.8, strokeWeight: 5, map: mapInstance.current });
      BUS_STOPS.forEach(stop => {
          const marker = new window.google.maps.Marker({ position: stop.position, map: mapInstance.current, title: stop.name, icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#FFFFFF", fillOpacity: 1, strokeColor: "#000000", strokeWeight: 2 } });
          const infowindow = new window.google.maps.InfoWindow({ content: `<b>${stop.name}</b>` });
          marker.addListener("click", () => infowindoow.open(mapInstance.current, marker));
      });
    }
  }, [isApiLoaded]);

  useEffect(() => {
    if(mapInstance.current) {
        for (const tripId in markers.current) {
            if (!busLocations[tripId] || (Date.now() - busLocations[tripId].location.timestamp > 5 * 60 * 1000) ) { 
                markers.current[tripId].marker.setMap(null);
                delete markers.current[tripId];
            }
        }
        let latestBus = null;
        let latestTimestamp = 0;
        for (const tripId in busLocations) {
            const bus = busLocations[tripId];
            if (!bus.location || !bus.location.timestamp) continue; 
            if (Date.now() - bus.location.timestamp > 5 * 60 * 1000) continue;
            if (bus.location.timestamp > latestTimestamp) {
                latestTimestamp = bus.location.timestamp;
                latestBus = bus;
            }
            const position = { lat: bus.location.lat, lng: bus.location.lng };
            const infoContent = `<b>${bus.time} Trip</b><br>${bus.direction}`;
            if (markers.current[tripId]) { 
                markers.current[tripId].marker.setPosition(position);
                markers.current[tripId].infowindow.setContent(infoContent);
            } else { 
                const infowindow = new window.google.maps.InfoWindow({ content: infoContent });
                const marker = new window.google.maps.Marker({
                    position,
                    map: mapInstance.current,
                    icon: { path: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11C5.84 5 5.28 5.42 5.08 6.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z', fillColor: '#FFC107', fillOpacity: 1, strokeWeight: 1.2, strokeColor: '#000000', rotation: 0, scale: 1.8, anchor: new window.google.maps.Point(12, 12) }
                });
                marker.addListener("click", () => infowindow.open(mapInstance.current, marker));
                markers.current[tripId] = { marker, infowindow };
            }
        }
        if (latestBus) {
            const latestPosition = { lat: latestBus.location.lat, lng: latestBus.location.lng };
            mapInstance.current.panTo(latestPosition);
        }
    }
}, [busLocations, isApiLoaded]);

  if (!isApiLoaded) return <div className="flex items-center justify-center h-full">Loading Map...</div>;
  return <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />;
};

// --- Modals and Data ---
const TripSelectorModal = ({ onSelect, onClose }) => { 
    const activeTrips = getActiveTrips(); 
    return ( 
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold">Select Your Trip</h3><button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-3xl">&times;</button></div>
                {activeTrips.length > 0 ? ( <div className="space-y-2"><p className="text-sm text-gray-600 mb-4">Which bus are you currently on?</p>{activeTrips.map(trip => ( <button key={trip.id} onClick={() => onSelect(trip)} className="w-full text-left p-3 bg-gray-100 hover:bg-green-100 rounded-md transition-colors"><p className="font-semibold">{trip.time}</p><p className="text-sm text-gray-700">{trip.direction}</p></button> ))}</div> ) : ( <div><p className="text-center text-gray-700 py-4 font-medium">No buses are scheduled to be running right now.</p><p className="text-center text-xs text-gray-500 -mt-3 pb-4">You can only share your location during active times according to the schedule below.</p><hr className="my-2 border-gray-200" /><div className="text-left text-sm mt-4"><h4 className="font-bold text-center mb-3 text-gray-800">Full Schedule</h4><div className="mb-3"><h5 className="font-semibold text-gray-700">Sunday - Thursday</h5>{Object.entries(busSchedule.weekday).map(([direction, times]) => ( <div key={direction} className="mt-1"><p className="font-medium text-gray-600">{direction}</p><p className="text-xs text-gray-500">{times.join(' | ')}</p></div> ))}</div><div><h5 className="font-semibold text-gray-700">Friday - Saturday</h5>{Object.entries(busSchedule.weekend).map(([direction, times]) => ( <div key={direction} className="mt-1"><p className="font-medium text-gray-600">{direction}</p><p className="text-xs text-gray-500">{times.join(' | ')}</p></div> ))}</div></div></div> )}
            </div>
        </div> 
    ); 
};
const ScheduleModal = ({ onClose }) => ( <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}><div className="bg-white rounded-lg shadow-xl w-full max-w-lg relative" onClick={(e) => e.stopPropagation()}><div className="p-4 border-b flex justify-between items-center"><h2 className="text-xl font-bold">JU Bus Schedule</h2><button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-3xl">&times;</button></div><div className="p-4" style={{ maxHeight: '80vh', overflowY: 'auto' }}><img src="https://i.postimg.cc/DwsrfQTt/image.png" alt="JU Bus Schedule" className="w-full h-auto"/></div></div></div> );
const Modal = ({ modalConfig, closeModal }) => { const { title, message, type, onConfirm } = modalConfig; if (!type) return null; const handleConfirm = () => { if (onConfirm) onConfirm(); closeModal(); }; return ( <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm text-center"><h3 className="text-xl font-bold mb-4">{title}</h3><p className="text-gray-700 mb-6">{message}</p><div className={`flex ${type === 'confirm' ? 'justify-between' : 'justify-center'} space-x-4`}>{type === 'confirm' && ( <button onClick={closeModal} className="px-6 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold">Cancel</button> )}<button onClick={handleConfirm} className="px-6 py-2 rounded text-white font-semibold bg-blue-500 hover:bg-blue-600">{type === 'confirm' ? "Confirm" : "OK"}</button></div></div></div> ); };
const PasswordPrompt = ({ onConfirm, onCancel }) => { const [password, setPassword] = useState(''); const inputRef = useRef(null); useEffect(() => inputRef.current?.focus(), []); const handleSubmit = (e) => { e.preventDefault(); onConfirm(password); }; return ( <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"><form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm"><h3 className="text-lg font-bold mb-4">Admin Access</h3><input ref={inputRef} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter password"/><div className="flex justify-end space-x-4 mt-6"><button type="button" onClick={onCancel} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold">Cancel</button><button type="submit" className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white font-semibold">Enter</button></div></form></div> ); };
const ROUTE_PATH = [ { lat: 23.89785, lng: 90.26784 }, { lat: 23.88455, lng: 90.26779 }, { lat: 23.88104, lng: 90.26776 }, { lat: 23.87475, lng: 90.26787 }, { lat: 23.87485, lng: 90.26952 }, { lat: 23.87574, lng: 90.27086 }, { lat: 23.87593, lng: 90.27316 }, { lat: 23.87039, lng: 90.27262 }, { lat: 23.86382, lng: 90.26818 }, { lat: 23.85885, lng: 90.26242 }, { lat: 23.84781, lng: 90.25743 }, { lat: 23.81187, lng: 90.25751 }, { lat: 23.79946, lng: 90.26296 }, { lat: 23.79334, lng: 90.27050 }, { lat: 23.78591, lng: 90.33011 }, { lat: 23.78152, lng: 90.35191 }, { lat: 23.77515, lng: 90.36531 }, { lat: 23.75830, lng: 90.37408 }, { lat: 23.74784, lng: 90.38037 }, { lat: 23.73888, lng: 90.38335 }, { lat: 23.73876, lng: 90.39091 }, { lat: 23.73814, lng: 90.39568 }, { lat: 23.73272, lng: 90.39552 }, { lat: 23.72797, lng: 90.40025 }, { lat: 23.72823, lng: 90.40402 }, { lat: 23.72456, lng: 90.40490 } ];
const BUS_STOPS = [ { id: 'ju_transport', name: 'JU Transport Office', position: { lat: 23.89785, lng: 90.26784 } }, { id: 'murad_chatter', name: 'Murad Chatter', position: { lat: 23.88104, lng: 90.26776 } }, { id: 'mmh_hall', name: 'MMH Hall', position: { lat: 23.87574, lng: 90.27086 } }, { id: 'radio_colony', name: 'Radio Colony', position: { lat: 23.85885, lng: 90.26242 } }, { id: 'savar', name: 'Savar', position: { lat: 23.84781, lng: 90.25743 } }, { id: 'hemayetpur', name: 'Hemayetpur', position: { lat: 23.79334, lng: 90.27050 } }, { id: 'amin_bazar', name: 'Amin Bazar', position: { lat: 23.78591, lng: 90.33011 } }, { id: 'technical', name: 'Technical', position: { lat: 23.78152, lng: 90.35191 } }, { id: 'shyamoli', name: 'Shyamoli', position: { lat: 23.77515, lng: 90.36531 } }, { id: 'aarong', name: 'Aarong', position: { lat: 23.75830, lng: 90.37408 } }, { id: 'science_lab', name: 'Science Lab', position: { lat: 23.73888, lng: 90.38335 } }, { id: 'katabon', name: 'Katabon', position: { lat: 23.73876, lng: 90.39091 } }, { id: 'shahbag', name: 'Shahbag', position: { lat: 23.73814, lng: 90.39568 } }, { id: 'tsc', name: 'TSC', position: { lat: 23.73272, lng: 90.39552 } }, { id: 'bongobazar', name: 'Bongobazar', position: { lat: 23.72456, lng: 90.40490 } } ];

