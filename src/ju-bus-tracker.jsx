import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, remove } from 'firebase/database';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyA2q8VjveB5gWgk-31GSPi2gWbylqm0rV8",
  authDomain: "ju-bus-db4b4.firebaseapp.com",
  databaseURL: "https://ju-bus-db4b4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ju-bus-db4b4",
  storageBucket: "ju-bus-db4b4.appspot.com",
  messagingSenderId: "1071735242909",
  appId: "1:1071735242909:web:f2b222a91b1c38ba37d474"
};

// --- Google Maps API Key ---
const GOOGLE_MAPS_API_KEY = "AIzaSyD-Uw_5GesPQhMfzdm_YhlVx7sDG218Y-c";

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Main App Component ---
export default function App() {
  const [busLocation, setBusLocation] = useState(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [modal, setModal] = useState({ title: '', message: '', type: null });
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const watchId = useRef(null);

  const BUS_LOCATION_PATH = 'bus/location';
  const busLocationRef = ref(db, BUS_LOCATION_PATH);

  useEffect(() => {
    const unsubscribe = onValue(busLocationRef, (snapshot) => {
      setBusLocation(snapshot.val());
    });
    return () => unsubscribe();
  }, []);

  const startSharingLocation = () => {
    if (!navigator.geolocation) {
      setModal({ title: 'Error', message: 'Geolocation is not supported by your browser.', type: 'alert' });
      return;
    }
    setIsSharing(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        set(busLocationRef, { lat: latitude, lng: longitude, timestamp: Date.now() });
      },
      (error) => {
        console.error("Geolocation Error:", error);
        setModal({ title: 'Location Error', message: "Could not get your location. Please ensure you've enabled location services.", type: 'alert' });
        stopSharingLocation();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const stopSharingLocation = () => {
    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsSharing(false);
  };

  const handleShareButtonClick = () => {
    isSharing ? stopSharingLocation() : startSharingLocation();
  };
  
  const handleResetLocation = () => {
    setModal({
      title: 'Confirm Reset',
      message: 'Are you sure you want to clear the current bus location from the map?',
      type: 'confirm',
      onConfirm: () => {
        remove(busLocationRef)
          .then(() => setModal({ title: 'Success', message: 'Bus location has been reset.', type: 'alert' }))
          .catch(error => console.error("Error resetting location:", error));
      }
    });
  };

  const toggleAdminView = () => {
    isAdmin ? setIsAdmin(false) : setShowPasswordPrompt(true);
  };

  const handlePasswordSubmit = (password) => {
    setShowPasswordPrompt(false);
    if (password === "juadmin") {
      setIsAdmin(true);
    } else {
      setModal({ title: 'Access Denied', message: 'Incorrect password.', type: 'alert' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans flex flex-col items-center text-gray-800">
      <header className="w-full bg-green-700 text-white p-4 text-center shadow-md sticky top-0 z-20">
        <h1 className="text-2xl font-bold">JU Bus Tracker</h1>
        <p className="text-sm">Real-time bus tracking for Jahangirnagar University</p>
      </header>
      
      <main className="w-full max-w-4xl p-4 flex-grow">
        <div className="w-full h-96 bg-gray-300 rounded-lg shadow-lg mb-6 relative overflow-hidden">
            <GoogleMapComponent busLocation={busLocation} />
            <div className="absolute top-2 right-2 bg-white/80 p-2 rounded shadow text-xs z-10">
                <p className="font-bold">Route:</p>
                <p>Campus ↔ Bongobazar</p>
            </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-lg text-center">
            <h2 className="text-xl font-semibold mb-2">Are you on the bus?</h2>
            <p className="text-gray-600 mb-4">Click the button below to help others track the bus.</p>
            <button
              onClick={handleShareButtonClick}
              className={`px-8 py-3 rounded-full font-bold text-white transition-all duration-300 transform hover:scale-105 ${
                isSharing ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isSharing ? 'Stop Sharing Location' : 'Share My Location'}
            </button>
            {isSharing && <p className="text-sm text-green-600 mt-2 animate-pulse">Sharing your location live...</p>}
            <p className="text-xs text-gray-500 mt-4">Your location is only used to show the bus's position and is not stored personally.</p>
        </div>
        
        {isAdmin && (
             <div className="mt-6 bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-center">Admin Panel</h2>
                <div className="flex flex-col items-center space-y-4">
                    <button onClick={handleResetLocation} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded">
                        Reset Bus Location
                    </button>
                </div>
            </div>
        )}
      </main>

       <footer className="w-full p-4 text-center text-xs text-gray-600">
            <p>&copy; {new Date().getFullYear()} JU Bus Tracker. A conceptual project.</p>
            <button onClick={toggleAdminView} className="text-blue-500 hover:underline mt-2">
                {isAdmin ? 'Exit Admin Mode' : 'Admin Access'}
            </button>
       </footer>
       
       <Modal
          modalConfig={modal}
          closeModal={() => setModal({ title: '', message: '', type: null })}
       />
       {showPasswordPrompt && (
          <PasswordPrompt
            onConfirm={handlePasswordSubmit}
            onCancel={() => setShowPasswordPrompt(false)}
          />
       )}
    </div>
  );
}

// --- NEW High-Fidelity Route and Stop Data ---
const ROUTE_PATH = [
    { lat: 23.89785, lng: 90.26784 }, { lat: 23.88455, lng: 90.26779 },
    { lat: 23.88104, lng: 90.26776 }, { lat: 23.87475, lng: 90.26787 },
    { lat: 23.87485, lng: 90.26952 }, { lat: 23.87574, lng: 90.27086 },
    { lat: 23.87593, lng: 90.27316 }, { lat: 23.87039, lng: 90.27262 },
    { lat: 23.86382, lng: 90.26818 }, { lat: 23.85885, lng: 90.26242 },
    { lat: 23.84781, lng: 90.25743 }, { lat: 23.81187, lng: 90.25751 },
    { lat: 23.79946, lng: 90.26296 }, { lat: 23.79334, lng: 90.27050 },
    { lat: 23.78591, lng: 90.33011 }, { lat: 23.78152, lng: 90.35191 },
    { lat: 23.77515, lng: 90.36531 }, { lat: 23.75830, lng: 90.37408 },
    { lat: 23.74784, lng: 90.38037 }, { lat: 23.73888, lng: 90.38335 },
    { lat: 23.73876, lng: 90.39091 }, { lat: 23.73814, lng: 90.39568 },
    { lat: 23.73272, lng: 90.39552 }, { lat: 23.72797, lng: 90.40025 },
    { lat: 23.72823, lng: 90.40402 }, { lat: 23.72456, lng: 90.40490 }
];

const BUS_STOPS = [
    { id: 'ju_transport', name: 'JU Transport Office', position: { lat: 23.89785, lng: 90.26784 } },
    { id: 'murad_chatter', name: 'Murad Chatter', position: { lat: 23.88104, lng: 90.26776 } },
    { id: 'mmh_hall', name: 'MMH Hall', position: { lat: 23.87574, lng: 90.27086 } },
    { id: 'radio_colony', name: 'Radio Colony', position: { lat: 23.85885, lng: 90.26242 } },
    { id: 'savar', name: 'Savar', position: { lat: 23.84781, lng: 90.25743 } },
    { id: 'hemayetpur', name: 'Hemayetpur', position: { lat: 23.79334, lng: 90.27050 } },
    { id: 'amin_bazar', name: 'Amin Bazar', position: { lat: 23.78591, lng: 90.33011 } },
    { id: 'technical', name: 'Technical', position: { lat: 23.78152, lng: 90.35191 } },
    { id: 'shyamoli', name: 'Shyamoli', position: { lat: 23.77515, lng: 90.36531 } },
    { id: 'aarong', name: 'Aarong', position: { lat: 23.75830, lng: 90.37408 } },
    { id: 'science_lab', name: 'Science Lab', position: { lat: 23.73888, lng: 90.38335 } },
    { id: 'katabon', name: 'Katabon', position: { lat: 23.73876, lng: 90.39091 } },
    { id: 'shahbag', name: 'Shahbag', position: { lat: 23.73814, lng: 90.39568 } },
    { id: 'tsc', name: 'TSC', position: { lat: 23.73272, lng: 90.39552 } },
    { id: 'bongobazar', name: 'Bongobazar', position: { lat: 23.72456, lng: 90.40490 } }
];


// --- Google Map Component ---
const GoogleMapComponent = ({ busLocation }) => {
  const mapDivRef = useRef(null);
  const mapInstance = useRef(null);
  const markerInstance = useRef(null);
  const [isApiLoaded, setApiLoaded] = useState(false);

  // Effect to load the Google Maps API script
  useEffect(() => {
    if (window.google && window.google.maps) {
      setApiLoaded(true);
      return;
    }
    if (document.getElementById('google-maps-script')) return;

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initMap`;
    script.async = true;
    script.defer = true;
    
    window.initMap = () => document.dispatchEvent(new Event('google-maps-api-loaded'));
    
    const onApiLoad = () => setApiLoaded(true);
    document.addEventListener('google-maps-api-loaded', onApiLoad);
    document.head.appendChild(script);
    
    return () => document.removeEventListener('google-maps-api-loaded', onApiLoad);
  }, []);

  // Effect to initialize the map once API is loaded
  useEffect(() => {
    if (isApiLoaded && mapDivRef.current && !mapInstance.current) {
      const mapOptions = {
        center: { lat: 23.81, lng: 90.33 }, // Centered on the entire route
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
        mapId: "1c2f6d2f7f2868a",
      };
      mapInstance.current = new window.google.maps.Map(mapDivRef.current, mapOptions);
    }
  }, [isApiLoaded]);

  // Effect to draw route and stops
  useEffect(() => {
    if (mapInstance.current) {
        // Draw the route line
        new window.google.maps.Polyline({
            path: ROUTE_PATH,
            geodesic: true,
            strokeColor: '#4285F4', // A nice Google blue
            strokeOpacity: 0.8,
            strokeWeight: 5,
            map: mapInstance.current,
        });

        // Draw the stop markers
        BUS_STOPS.forEach(stop => {
            const marker = new window.google.maps.Marker({
                position: stop.position,
                map: mapInstance.current,
                title: stop.name,
                icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 7,
                    fillColor: "#FFFFFF",
                    fillOpacity: 1,
                    strokeColor: "#000000",
                    strokeWeight: 2,
                },
            });
            // Add a simple info window on click
            const infowindow = new window.google.maps.InfoWindow({ content: `<b>${stop.name}</b>` });
            marker.addListener("click", () => infowindow.open(mapInstance.current, marker));
        });
    }
  }, [isApiLoaded]); // This effect runs once the map is ready

  // Effect to update the marker when busLocation changes
  useEffect(() => {
    if (mapInstance.current && busLocation) {
      const position = { lat: busLocation.lat, lng: busLocation.lng };

      if (!markerInstance.current) {
        markerInstance.current = new window.google.maps.Marker({
          position,
          map: mapInstance.current,
          icon: {
            path: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11C5.84 5 5.28 5.42 5.08 6.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
            fillColor: '#EA4335', // A distinct red for the bus
            fillOpacity: 1.0,
            strokeWeight: 1,
            strokeColor: '#FFFFFF',
            scale: 1.5,
            anchor: new window.google.maps.Point(12, 12),
          },
        });
      } else {
        markerInstance.current.setPosition(position);
      }
      mapInstance.current.panTo(position);
    }
  }, [busLocation, isApiLoaded]);

  if (!isApiLoaded) return <div className="flex items-center justify-center h-full">Loading Map...</div>;
  
  return <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />;
};


// --- Custom Modal Component ---
const Modal = ({ modalConfig, closeModal }) => {
    const { title, message, type, onConfirm } = modalConfig;
    if (!type) return null;
    const handleConfirm = () => {
        if (onConfirm) onConfirm();
        closeModal(); 
    };
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm text-center">
                <h3 className="text-xl font-bold mb-4">{title}</h3>
                <p className="text-gray-700 mb-6">{message}</p>
                <div className={`flex ${type === 'confirm' ? 'justify-between' : 'justify-center'} space-x-4`}>
                    {type === 'confirm' && (
                         <button onClick={closeModal} className="px-6 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold">Cancel</button>
                    )}
                    <button onClick={handleConfirm} className="px-6 py-2 rounded text-white font-semibold bg-blue-500 hover:bg-blue-600">{type === 'confirm' ? "Confirm" : "OK"}</button>
                </div>
            </div>
        </div>
    );
};

// --- Custom Password Prompt Component ---
const PasswordPrompt = ({ onConfirm, onCancel }) => {
    const [password, setPassword] = 'useState'('');
    const inputRef = useRef(null);
    useEffect(() => inputRef.current?.focus(), []);
    const handleSubmit = (e) => { e.preventDefault(); onConfirm(password); };
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
                <h3 className="text-lg font-bold mb-4">Admin Access</h3>
                <input ref={inputRef} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter password"/>
                <div className="flex justify-end space-x-4 mt-6">
                    <button type="button" onClick={onCancel} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold">Cancel</button>
                    <button type="submit" className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white font-semibold">Enter</button>
                </div>
            </form>
        </div>
    );
};

