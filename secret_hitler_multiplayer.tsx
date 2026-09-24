import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut 
} from 'firebase/auth';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    onSnapshot
} from 'firebase/firestore';
import { 
    LucideShield, LucideSkull, LucideCheck, LucideX, LucideEye, 
    LucideRefreshCw, LucideUsers, LucideAlertTriangle, LucideCrown, 
    LucideTrophy, LucideUser, LucideLogOut,
    LucideZap, LucideSmartphone, LucideGlobe, LucideBookOpen,
    LucideArrowRight, LucideSearch
} from 'lucide-react';

let firebaseApp, auth, db;
let isFirebaseAvailable = false;

try {
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
    if (firebaseConfig && firebaseConfig.apiKey) {
        firebaseApp = initializeApp(firebaseConfig);
        auth = getAuth(firebaseApp);
        db = getFirestore(firebaseApp);
        isFirebaseAvailable = true;
    }
} catch (e) {
    console.warn("Firebase initialization skipped or failed. Operating in local mode:", e);
    isFirebaseAvailable = false;
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'secret-hitler-app';

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;
const ROLE_LIBERAL = 'Liberal';
const ROLE_FASCIST = 'Fascist';
const ROLE_HITLER = 'Hitler';

// Exact Rulebook Deck Composition: 11 Fascist, 6 Liberal
const INITIAL_FASCIST_POLICIES = 11;
const INITIAL_LIBERAL_POLICIES = 6;

const ROLE_DISTRIBUTION = {
    5: { l: 3, f: 1, h: 1 },
    6: { l: 4, f: 1, h: 1 },
    7: { l: 4, f: 2, h: 1 },
    8: { l: 5, f: 2, h: 1 },
    9: { l: 5, f: 3, h: 1 },
    10: { l: 6, f: 3, h: 1 }
};

const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
};

const shuffleArray = (array) => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[i], newArr[j]];
    }
    return newArr;
};

const createDeck = () => {
    const deck = [];
    for (let i = 0; i < INITIAL_FASCIST_POLICIES; i++) deck.push('F');
    for (let i = 0; i < INITIAL_LIBERAL_POLICIES; i++) deck.push('L');
    return shuffleArray(deck);
};

const InlineQRCode = ({ value }) => {
    const size = 180;
    const grid = 15;
    const cellSize = size / grid;

    const matrix = useMemo(() => {
        const hash = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const m = [];
        for (let r = 0; r < grid; r++) {
            const row = [];
            for (let c = 0; c < grid; c++) {
                const isTopLeft = r < 4 && c < 4;
                const isTopRight = r < 4 && c >= grid - 4;
                const isBottomLeft = r >= grid - 4 && c < 4;
                const isCorner = isTopLeft || isTopRight || isBottomLeft;

                if (isCorner) {
                    const isBorder = r === 0 || r === 3 || c === 0 || c === 3 ||
                                     r === grid - 1 || r === grid - 4 || c === grid - 1 || c === grid - 4;
                    const isCenter = (r === 1.5 || r === 2) && (c === 1.5 || c === 2);
                    row.push(isBorder || isCenter);
                } else {
                    const val = (Math.sin(hash * (r * grid + c + 1)) * 10000) % 1;
                    row.push(Math.abs(val) > 0.45);
                }
            }
            m.push(row);
        }
        return m;
    }, [value]);

    return (
        <div className="bg-white p-3 rounded-xl shadow-2xl flex flex-col items-center">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <rect width={size} height={size} fill="#ffffff" />
                {matrix.map((row, r) =>
                    row.map((active, c) => active ? (
                        <rect key={`${r}-${c}`} x={c * cellSize} y={r * cellSize} width={cellSize} height={cellSize} fill="#000000" rx={0.5} />
                    ) : null)
                )}
            </svg>
            <span className="text-black font-mono font-black text-xs tracking-widest mt-2 uppercase">Room: {value}</span>
        </div>
    );
};

export default function App() {
    // User & Profile State
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [view, setView] = useState('auth');
    const [error, setError] = useState('');
    const [guestNickname, setGuestNickname] = useState('');

    // Game State
    const [gameState, setGameState] = useState(null);
    const [roomCode, setRoomCode] = useState('');
    const [playerName, setPlayerName] = useState('');
    const processedGameOver = useRef(false);

    // Executive Power State Modal
    const [peekCards, setPeekCards] = useState(null);
    const [investigationResult, setInvestigationResult] = useState(null);

    // Auth Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [useCloudSync, setUseCloudSync] = useState(true);

    const handleEmailAuth = async (e) => {
        if (e) e.preventDefault();
        
        if (!isFirebaseAvailable || !auth) {
            setError("Cloud connection required for registered accounts. Please play as Guest for now.");
            return;
        }

        try {
            let cred;
            if (isRegistering) {
                cred = await createUserWithEmailAndPassword(auth, email, password);
            } else {
                cred = await signInWithEmailAndPassword(auth, email, password);
            }
            
            const name = playerName.trim() || email.split('@')[0];
            const newUserObj = { uid: cred.user.uid, isAnonymous: false, displayName: name };
            const newProfileObj = { 
                displayName: name, isAnonymous: false, 
                gamesPlayed: 0, wins: 0, losses: 0, liberalWins: 0, fascistWins: 0, friends: [] 
            };
            
            setUser(newUserObj);
            setUserProfile(newProfileObj);
            setError('');
            setView('home');
        } catch (err) {
            setError(err.message || "Authentication failed.");
        }
    };

    const handleGuestLogin = async (e) => {
        if (e) e.preventDefault();
        
        const nickname = guestNickname.trim() || playerName.trim() || 'Guest_' + Math.floor(1000 + Math.random() * 9000);
        let guestId = 'guest_' + Math.random().toString(36).substring(2, 9);

        if (isFirebaseAvailable && auth) {
            try {
                const customToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                let cred;
                
                if (customToken) {
                    cred = await signInWithCustomToken(auth, customToken);
                } else {
                    cred = await signInAnonymously(auth);
                }
                
                if (cred?.user) {
                    guestId = cred.user.uid;
                }
            } catch (err) {
                console.warn("Firebase anon login bypassed, continuing with local guest account:", err);
            }
        }

        const guestUserObj = { uid: guestId, isAnonymous: true, displayName: nickname };
        const guestProfileObj = {
            displayName: nickname, isAnonymous: true,
            gamesPlayed: 0, wins: 0, losses: 0, liberalWins: 0, fascistWins: 0, friends: []
        };

        try {
            localStorage.setItem('sh_local_user', JSON.stringify(guestUserObj));
            localStorage.setItem('sh_local_profile_' + guestId, JSON.stringify(guestProfileObj));
        } catch (err) {}

        setUser(guestUserObj);
        setUserProfile(guestProfileObj);
        setError('');
        setView('home');
    };

    const logout = async () => {
        if (isFirebaseAvailable && auth) {
            try { await signOut(auth); } catch (e) {}
        }
        setUser(null);
        setUserProfile(null);
        setView('auth');
    };

    useEffect(() => {
        if (!user || !roomCode) return;

        let localChannel = null;
        try {
            localChannel = new BroadcastChannel('sh_game_' + roomCode);
            localChannel.onmessage = (event) => {
                if (event.data) setGameState(event.data);
            };
        } catch (e) {}

        if (isFirebaseAvailable && db && useCloudSync) {
            const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'games', roomCode);
            const unsubscribe = onSnapshot(gameRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setGameState({ id: docSnap.id, ...data });
                    
                    if (['home', 'create', 'join'].includes(view)) {
                        setView(data.status === 'lobby' ? 'lobby' : 'game');
                    }
                    
                    if (data.status === 'game_over' && !processedGameOver.current) {
                        processedGameOver.current = true;
                        processPostGameStats(data);
                    } else if (data.status !== 'game_over') {
                        processedGameOver.current = false;
                    }
                } else {
                    setGameState(null);
                    if (view === 'lobby' || view === 'game') {
                        setError("Room was closed or not found.");
                        setView('home');
                        setRoomCode('');
                    }
                }
            }, (err) => {
                if (err?.code === 'permission-denied') {
                    console.warn("Firestore rules restricted cloud sync. Falling back to local network mode.");
                    setUseCloudSync(false);
                }
            });
            return () => {
                unsubscribe();
                if (localChannel) localChannel.close();
            };
        }
        return () => { if (localChannel) localChannel.close(); };
    }, [user, roomCode, view, useCloudSync]);

    const processPostGameStats = async (state) => {
        if (!user || !userProfile) return;
        const myPlayer = state.players.find(p => p.uid === user.uid);
        if (!myPlayer || !myPlayer.role) return;

        const isLiberal = myPlayer.role === ROLE_LIBERAL;
        const won = (state.winner === 'Liberals' && isLiberal) || (state.winner === 'Fascists' && !isLiberal);

        const updatedProfile = {
            ...userProfile,
            gamesPlayed: (userProfile.gamesPlayed || 0) + 1,
            wins: (userProfile.wins || 0) + (won ? 1 : 0),
            losses: (userProfile.losses || 0) + (won ? 0 : 1),
            liberalWins: (userProfile.liberalWins || 0) + (won && isLiberal ? 1 : 0),
            fascistWins: (userProfile.fascistWins || 0) + (won && !isLiberal ? 1 : 0)
        };

        setUserProfile(updatedProfile);

        if (isFirebaseAvailable && db && !user.isAnonymous && useCloudSync) {
            try {
                const profileRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', user.uid);
                await updateDoc(profileRef, updatedProfile);
            } catch (err) {}
        }
    };

    const updateGame = async (updates) => {
        if (!roomCode) return;
        const nextState = { ...(gameState || {}), ...updates, lastAction: Date.now() };
        setGameState(nextState);

        try {
            const bc = new BroadcastChannel('sh_game_' + roomCode);
            bc.postMessage(nextState);
            bc.close();
        } catch (e) {}

        if (isFirebaseAvailable && db && useCloudSync) {
            try {
                const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'games', roomCode);
                await updateDoc(gameRef, updates);
            } catch (err) {
                if (err?.code === 'permission-denied') setUseCloudSync(false);
            }
        }
    };

    const createGame = async (mode) => {
        if (!user) return;
        const newCode = generateRoomCode();
        const initialName = mode === 'online' ? (userProfile?.displayName || 'Host') : 'TABLE_BOARD';
        
        const newGameState = {
            id: newCode, status: 'lobby', mode: mode, hostId: user.uid,
            players: mode === 'online' ? [{ uid: user.uid, name: initialName, role: null, isDead: false }] : [],
            deck: [], discard: [], liberal: 0, fascist: 0, tracker: 0,
            presidentIndex: 0, chancellorId: null, nominatedId: null, 
            prevPresidentId: null, prevChancellorId: null,
            votes: {}, drawn: [], readyToReveal: [], winner: null, 
            specialElectionNextPres: null, activePower: null, lastAction: Date.now()
        };

        if (isFirebaseAvailable && db && useCloudSync) {
            try {
                const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'games', newCode);
                await setDoc(gameRef, newGameState);
            } catch (err) {
                if (err?.code === 'permission-denied') setUseCloudSync(false);
            }
        }

        setGameState(newGameState);
        setRoomCode(newCode);
        setView('lobby');
    };

    const joinGame = async (codeToJoin) => {
        if (!user || !codeToJoin) return;
        const code = codeToJoin.toUpperCase().trim();
        const joinName = playerName.trim() || userProfile?.displayName || 'Player_' + Math.floor(100 + Math.random() * 900);

        if (isFirebaseAvailable && db && useCloudSync) {
            try {
                const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'games', code);
                const snap = await getDoc(gameRef);
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.status !== 'lobby') { setError("Game already in progress."); return; }
                    
                    const existingIndex = data.players.findIndex(p => p.uid === user.uid);
                    let updatedPlayers = [...data.players];
                    if (existingIndex === -1) {
                        if (data.players.length >= MAX_PLAYERS) { setError("Room is full."); return; }
                        updatedPlayers.push({ uid: user.uid, name: joinName, role: null, isDead: false });
                        await updateDoc(gameRef, { players: updatedPlayers });
                    }
                    setRoomCode(code);
                    setView('lobby');
                    return;
                }
            } catch (err) {
                if (err?.code === 'permission-denied') setUseCloudSync(false);
            }
        }
        setRoomCode(code);
        setView('lobby');
    };

    const startGame = async () => {
        if (!gameState || gameState.hostId !== user.uid) return;
        const playerCount = gameState.players.length;
        if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
            setError(`Requires between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`);
            return;
        }

        const dist = ROLE_DISTRIBUTION[playerCount];
        let roles = Array(dist.l).fill(ROLE_LIBERAL)
                    .concat(Array(dist.f).fill(ROLE_FASCIST))
                    .concat([ROLE_HITLER]);
        roles = shuffleArray(roles);

        const newPlayers = gameState.players.map((p, i) => ({ ...p, role: roles[i], isDead: false }));
        
        await updateGame({
            status: 'reveal', players: newPlayers, deck: createDeck(), discard: [],
            liberal: 0, fascist: 0, tracker: 0, presidentIndex: Math.floor(Math.random() * playerCount),
            chancellorId: null, nominatedId: null, prevPresidentId: null, prevChancellorId: null,
            votes: {}, drawn: [], readyToReveal: []
        });
    };

    const handleAcknowledgeReveal = async () => {
        const newReady = [...(gameState.readyToReveal || []), user.uid];
        if (newReady.length === gameState.players.length) {
            await updateGame({ status: 'nominate', readyToReveal: [] });
        } else {
            await updateGame({ readyToReveal: newReady });
        }
    };

    const getNextPresidentIndex = (state) => {
        if (state.specialElectionNextPres !== null && state.specialElectionNextPres !== undefined) {
            return state.specialElectionNextPres;
        }
        let nextIdx = (state.presidentIndex + 1) % state.players.length;
        while (state.players[nextIdx].isDead) {
            nextIdx = (nextIdx + 1) % state.players.length;
        }
        return nextIdx;
    };

    const checkWinCondition = (state, newFascist, newLiberal, hitlerElected) => {
        if (newLiberal >= 5) return 'Liberals';
        if (newFascist >= 6) return 'Fascists';
        if (hitlerElected && newFascist >= 3) return 'Fascists';
        return null;
    };

    const tallyVotes = async (state) => {
        const alivePlayers = state.players.filter(p => !p.isDead);
        const votes = state.votes || {};
        if (Object.keys(votes).length < alivePlayers.length) return;

        let ja = 0, nein = 0;
        Object.values(votes).forEach(v => v === 'ja' ? ja++ : nein++);

        if (ja > nein) {
            const hitlerElected = state.players.find(p => p.uid === state.nominatedId)?.role === ROLE_HITLER;
            const winner = checkWinCondition(state, state.fascist, state.liberal, hitlerElected);
            
            if (winner) {
                await updateGame({ status: 'game_over', winner, chancellorId: state.nominatedId });
                return;
            }

            let currentDeck = [...state.deck];
            let currentDiscard = [...state.discard];
            if (currentDeck.length < 3) {
                currentDeck = shuffleArray([...currentDeck, ...currentDiscard]);
                currentDiscard = [];
            }
            const drawn = currentDeck.splice(0, 3);

            await updateGame({
                status: 'president_discard', chancellorId: state.nominatedId,
                drawn: drawn, deck: currentDeck, discard: currentDiscard, tracker: 0
            });
        } else {
            let newTracker = state.tracker + 1;
            let currentDeck = [...state.deck];
            let currentDiscard = [...state.discard];
            let newFascist = state.fascist;
            let newLiberal = state.liberal;
            let winner = null;

            if (newTracker === 3) {
                if (currentDeck.length < 1) {
                    currentDeck = shuffleArray([...currentDeck, ...currentDiscard]);
                    currentDiscard = [];
                }
                const policy = currentDeck.shift();
                if (policy === 'F') newFascist++; else newLiberal++;
                winner = checkWinCondition(state, newFascist, newLiberal, false);
                newTracker = 0;

                await updateGame({
                    status: winner ? 'game_over' : 'nominate', winner, tracker: newTracker,
                    deck: currentDeck, discard: currentDiscard, fascist: newFascist, liberal: newLiberal,
                    presidentIndex: getNextPresidentIndex(state), nominatedId: null, chancellorId: null,
                    prevPresidentId: null, prevChancellorId: null, votes: {}, specialElectionNextPres: null
                });
                return;
            }

            await updateGame({
                status: 'nominate', tracker: newTracker, presidentIndex: getNextPresidentIndex(state),
                nominatedId: null, chancellorId: null, votes: {}, specialElectionNextPres: null
            });
        }
    };

    const enactPolicy = async (policy, state) => {
        let newFascist = state.fascist;
        let newLiberal = state.liberal;
        if (policy === 'F') newFascist++; else newLiberal++;

        const winner = checkWinCondition(state, newFascist, newLiberal, false);
        const playerCount = state.players.length;

        let executivePowerToTrigger = null;
        if (!winner && policy === 'F') {
            if (playerCount <= 6) {
                if (newFascist === 3) executivePowerToTrigger = 'peek';
                else if (newFascist === 4 || newFascist === 5) executivePowerToTrigger = 'execution';
            } else if (playerCount <= 8) {
                if (newFascist === 2) executivePowerToTrigger = 'investigate';
                else if (newFascist === 3) executivePowerToTrigger = 'special_election';
                else if (newFascist === 4 || newFascist === 5) executivePowerToTrigger = 'execution';
            } else {
                if (newFascist === 1 || newFascist === 2) executivePowerToTrigger = 'investigate';
                else if (newFascist === 3) executivePowerToTrigger = 'special_election';
                else if (newFascist === 4 || newFascist === 5) executivePowerToTrigger = 'execution';
            }
        }

        let nextStatus = winner ? 'game_over' : (executivePowerToTrigger ? 'executive_power' : 'nominate');

        await updateGame({
            status: nextStatus, activePower: executivePowerToTrigger, winner, fascist: newFascist, liberal: newLiberal, 
            drawn: [], presidentIndex: (nextStatus === 'nominate') ? getNextPresidentIndex(state) : state.presidentIndex,
            prevPresidentId: state.players[state.presidentIndex].uid, prevChancellorId: state.chancellorId,
            nominatedId: null, chancellorId: nextStatus === 'nominate' ? null : state.chancellorId,
            votes: {}, specialElectionNextPres: nextStatus === 'nominate' ? null : state.specialElectionNextPres
        });
    };

    useEffect(() => {
        if (gameState?.status === 'voting') {
            const aliveCount = gameState.players.filter(p => !p.isDead).length;
            if (Object.keys(gameState.votes || {}).length === aliveCount) {
                if (gameState.hostId === user?.uid || gameState.mode === 'online') tallyVotes(gameState);
            }
        }
    }, [gameState?.votes, gameState?.status]);

    const getMyPlayer = () => gameState?.players.find(p => p.uid === user?.uid);
    const isHostDevice = () => gameState?.mode === 'offline' && gameState?.hostId === user?.uid;
    const getAlivePlayers = () => gameState?.players.filter(p => !p.isDead) || [];

    const TopBar = () => (
        <div className="bg-zinc-950 border-b border-red-900/40 p-4 flex justify-between items-center shadow-2xl sticky top-0 z-40">
            <h1 onClick={() => setView('home')} className="text-xl md:text-2xl font-black text-red-600 tracking-widest uppercase flex items-center gap-2 cursor-pointer hover:text-red-500 transition">
                <LucideShield className="w-6 h-6 text-red-600" />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-amber-500">Secret Hitler</span>
            </h1>
            <div className="flex items-center gap-4">
                {roomCode && (
                    <div className="bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-md text-gray-300 font-mono text-xs md:text-sm">
                        ROOM: <span className="text-white font-bold">{roomCode}</span>
                    </div>
                )}
                {userProfile && (
                    <div className="flex items-center gap-3">
                        <button onClick={() => setView('leaderboard')} className="text-gray-400 hover:text-amber-400 transition p-1.5 rounded-lg hover:bg-zinc-900"><LucideTrophy className="w-5 h-5" /></button>
                        <button onClick={() => setView('profile')} className="text-gray-400 hover:text-white transition flex items-center gap-2 p-1.5 rounded-lg hover:bg-zinc-900">
                            <LucideUser className="w-5 h-5" />
                            <span className="text-xs font-bold hidden sm:inline">{userProfile.displayName}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    const Notification = () => {
        if (!error) return null;
        return (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-500 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur animate-in slide-in-from-top-4">
                <LucideAlertTriangle className="w-5 h-5 shrink-0" />
                <span className="font-bold text-xs md:text-sm">{error}</span>
                <button onClick={() => setError('')} className="ml-2 bg-black/30 p-1 rounded hover:bg-black/50"><LucideX className="w-4 h-4" /></button>
            </div>
        );
    };

    const ViewAuth = () => (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black">
            <div className="w-full max-w-md bg-zinc-950/90 p-8 rounded-2xl border border-red-900/40 shadow-2xl backdrop-blur space-y-6">
                <div className="text-center space-y-2">
                    <LucideShield className="w-16 h-16 mx-auto text-red-600 drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
                    <h2 className="text-3xl font-black text-white uppercase tracking-widest">Secret Hitler</h2>
                </div>

                <div className="bg-zinc-900/90 p-5 rounded-xl border border-zinc-800 space-y-3">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Quick Play Nickname</label>
                    <input 
                        type="text" placeholder="e.g. Bismarck" value={guestNickname} 
                        onChange={(e) => setGuestNickname(e.target.value)}
                        className="w-full bg-black text-white border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-red-600 transition"
                        maxLength={15}
                    />
                    <button onClick={handleGuestLogin} className="w-full bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-black py-3.5 rounded-lg uppercase tracking-wider transition shadow-lg flex items-center justify-center gap-2">
                        Play as Guest <LucideArrowRight className="w-4 h-4" />
                    </button>
                </div>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800"></div></div>
                    <div className="relative flex justify-center"><span className="bg-zinc-950 px-3 text-xs text-gray-500 uppercase font-bold">Or Account Login</span></div>
                </div>

                <form onSubmit={handleEmailAuth} className="space-y-3">
                    {isRegistering && (
                        <input type="text" placeholder="Display Name" value={playerName} onChange={(e) => setPlayerName(e.target.value)} className="w-full bg-zinc-900 text-white border border-zinc-800 rounded-lg px-4 py-2.5 text-sm" required />
                    )}
                    <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-zinc-900 text-white border border-zinc-800 rounded-lg px-4 py-2.5 text-sm" required />
                    <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-zinc-900 text-white border border-zinc-800 rounded-lg px-4 py-2.5 text-sm" required minLength={6} />
                    
                    <button type="submit" className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-lg uppercase text-xs tracking-wider transition">
                        {isRegistering ? 'Create Account' : 'Sign In with Email'}
                    </button>
                </form>

                <div className="text-center">
                    <button onClick={() => setIsRegistering(!isRegistering)} className="text-xs text-gray-400 hover:text-white transition">
                        {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register"}
                    </button>
                </div>
            </div>
        </div>
    );

    const ViewProfile = () => {
        return (
            <div className="max-w-4xl mx-auto mt-8 p-4 space-y-6">
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 md:p-8 shadow-2xl">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800 pb-6">
                        <div>
                            <h2 className="text-3xl font-black text-white flex items-center gap-3">
                                <LucideUser className="w-8 h-8 text-red-500" /> {userProfile?.displayName}
                            </h2>
                        </div>
                        <button onClick={logout} className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-red-400 border border-zinc-800 px-4 py-2 rounded-lg transition">
                            <LucideLogOut className="w-4 h-4" /> Sign Out
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                        <div className="bg-zinc-900/60 p-4 rounded-xl text-center"><p className="text-gray-400 text-xs">Played</p><p className="text-3xl font-black">{userProfile?.gamesPlayed || 0}</p></div>
                        <div className="bg-zinc-900/60 p-4 rounded-xl text-center"><p className="text-gray-400 text-xs">Wins</p><p className="text-3xl font-black text-amber-500">{userProfile?.wins || 0}</p></div>
                        <div className="bg-zinc-900/60 p-4 rounded-xl text-center"><p className="text-gray-400 text-xs">Lib Wins</p><p className="text-3xl font-black text-blue-400">{userProfile?.liberalWins || 0}</p></div>
                        <div className="bg-zinc-900/60 p-4 rounded-xl text-center"><p className="text-gray-400 text-xs">Fas Wins</p><p className="text-3xl font-black text-red-500">{userProfile?.fascistWins || 0}</p></div>
                    </div>
                </div>
            </div>
        );
    };

    const ViewLeaderboard = () => {
        return (
            <div className="max-w-3xl mx-auto mt-8 p-4 text-center">
                <LucideTrophy className="w-12 h-12 mx-auto text-amber-500 mb-4" />
                <h2 className="text-3xl font-black text-white uppercase tracking-widest mb-4">Global Rankings</h2>
                <div className="bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl p-6 text-gray-400">
                    Leaderboard feature coming soon. Track your wins in your profile!
                </div>
            </div>
        );
    };

    const ViewHome = () => (
        <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 space-y-10 animate-in fade-in duration-300">
            <div className="text-center space-y-3 max-w-lg">
                <LucideShield className="w-24 h-24 mx-auto text-red-600 drop-shadow-[0_0_25px_rgba(220,38,38,0.6)]" />
                <h1 className="text-5xl sm:text-6xl font-black text-white tracking-tighter uppercase">Secret Hitler</h1>
                <p className="text-gray-400 text-xs sm:text-sm font-medium">A dramatic game of political strategy.</p>
            </div>
            <div className="w-full max-w-sm space-y-3">
                <button onClick={() => setView('create')} className="w-full py-4 bg-gradient-to-r from-red-700 to-red-600 text-white font-black rounded-xl shadow-lg uppercase text-sm flex items-center justify-center gap-2">
                    <LucideZap className="w-5 h-5" /> Host New Game
                </button>
                <button onClick={() => setView('join')} className="w-full py-4 bg-zinc-900 text-white font-black rounded-xl border border-zinc-800 uppercase text-sm flex items-center justify-center gap-2">
                    <LucideUsers className="w-5 h-5" /> Join Existing Game
                </button>
            </div>
        </div>
    );

    const ViewCreate = () => (
        <div className="max-w-md mx-auto mt-10 p-6 sm:p-8 bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl space-y-6">
            <h2 className="text-2xl font-black text-center text-white uppercase tracking-wider">Select Play Mode</h2>
            <div className="grid gap-4">
                <button onClick={() => createGame('offline')} className="p-6 bg-zinc-900 hover:bg-zinc-800 rounded-xl flex flex-col items-center gap-3 border-2 border-transparent hover:border-red-600/50 text-left">
                    <LucideSmartphone className="w-8 h-8 text-red-500" />
                    <div><span className="font-bold text-white uppercase text-sm block text-center">Offline Board Mode</span><span className="text-[11px] text-gray-400 text-center block mt-1">This screen acts as the main game board on a table.</span></div>
                </button>
                <button onClick={() => createGame('online')} className="p-6 bg-zinc-900 hover:bg-zinc-800 rounded-xl flex flex-col items-center gap-3 border-2 border-transparent hover:border-blue-600/50 text-left">
                    <LucideGlobe className="w-8 h-8 text-blue-400" />
                    <div><span className="font-bold text-white uppercase text-sm block text-center">Online Mode</span><span className="text-[11px] text-gray-400 text-center block mt-1">Everyone plays on their own device remotely.</span></div>
                </button>
            </div>
            <button onClick={() => setView('home')} className="w-full text-center text-gray-500 hover:text-white text-xs uppercase font-bold">Cancel</button>
        </div>
    );

    const ViewJoin = () => {
        const [code, setCode] = useState('');
        return (
            <div className="max-w-md mx-auto mt-10 p-8 bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl space-y-6">
                <h2 className="text-2xl font-black text-center text-white uppercase tracking-wider">Join Room</h2>
                <div className="space-y-4">
                    <label className="block text-center">
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">4-Letter Room Code</span>
                        <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} className="mt-2 block w-full rounded-xl bg-black border-2 border-zinc-800 text-white focus:border-red-600 text-center text-3xl font-mono font-black py-3" placeholder="ABCD" />
                    </label>
                    <label className="block">
                        <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Your Nickname</span>
                        <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={15} className="mt-1 block w-full rounded-lg bg-zinc-900 border border-zinc-800 text-white px-4 py-2.5 text-sm" placeholder={userProfile?.displayName || "Enter name"} />
                    </label>
                    <button onClick={() => joinGame(code)} disabled={code.length < 4} className="w-full py-4 bg-red-700 disabled:bg-zinc-900 disabled:text-gray-600 hover:bg-red-600 text-white font-black rounded-xl transition uppercase tracking-widest mt-2">Enter Room</button>
                </div>
                <button onClick={() => setView('home')} className="w-full text-center text-gray-500 hover:text-white text-xs uppercase font-bold">Cancel</button>
            </div>
        );
    };

    const ViewLobby = () => {
        const isHost = gameState?.hostId === user?.uid;
        const pCount = gameState?.players?.length || 0;
        return (
            <div className="max-w-4xl mx-auto mt-6 p-4 space-y-6">
                <div className="flex flex-col md:flex-row gap-8 items-center justify-center bg-zinc-950 p-8 rounded-2xl border border-zinc-800 shadow-2xl">
                    <div className="text-center space-y-3">
                        <h2 className="text-2xl font-black text-white uppercase tracking-widest">Room Lobby</h2>
                        <div className="bg-black border border-red-900/50 rounded-xl px-6 py-4 inline-block">
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Room Code</p>
                            <p className="text-5xl font-mono font-black text-white tracking-[0.3em]">{gameState?.id}</p>
                        </div>
                    </div>
                    {gameState?.id && <InlineQRCode value={gameState.id} />}
                </div>
                <div className="bg-zinc-950 rounded-2xl p-6 border border-zinc-800">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-black text-gray-300 uppercase tracking-widest">Joined Players ({pCount}/{MAX_PLAYERS})</h3>
                        {pCount < MIN_PLAYERS && <span className="text-xs font-bold text-red-400 bg-red-950/60 px-3 py-1 rounded border border-red-900/40">Need {MIN_PLAYERS - pCount} more</span>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {gameState?.players.map((p, i) => (
                            <div key={i} className="bg-zinc-900 py-3 px-4 rounded-xl border border-zinc-800 flex items-center justify-between">
                                <span className="text-white font-bold text-xs truncate">{p.name}</span>
                                {gameState.hostId === p.uid && <LucideCrown className="w-4 h-4 text-amber-400" />}
                            </div>
                        ))}
                    </div>
                </div>
                {isHost ? (
                    <button onClick={startGame} disabled={pCount < MIN_PLAYERS} className={`w-full py-5 font-black text-lg rounded-xl transition uppercase tracking-widest shadow-2xl ${pCount >= MIN_PLAYERS ? 'bg-red-700 hover:bg-red-600 text-white cursor-pointer' : 'bg-zinc-900 text-gray-600 border border-zinc-800 cursor-not-allowed'}`}>
                        {pCount >= MIN_PLAYERS ? 'Start Game' : `Waiting for Minimum ${MIN_PLAYERS} Players`}
                    </button>
                ) : (
                    <div className="text-center text-gray-400 font-bold uppercase tracking-widest text-xs animate-pulse p-4 bg-zinc-950 rounded-xl border border-zinc-800">Waiting for host to start...</div>
                )}
            </div>
        );
    };

    const CentralBoard = () => {
        if (!gameState) return null;
        const libTrack = [0,1,2,3,4];
        const fasTrack = [0,1,2,3,4,5]; 
        
        return (
            <div className="bg-zinc-950 p-4 sm:p-6 rounded-2xl border border-zinc-800 shadow-2xl max-w-6xl mx-auto w-full space-y-6">
                <div className="flex justify-between items-center text-xs font-mono text-gray-400 border-b border-zinc-900 pb-3">
                    <div className="flex gap-3">
                        <span className="bg-black px-2.5 py-1 rounded border border-zinc-800">Draw: <strong className="text-white">{gameState.deck?.length || 0}</strong></span>
                        <span className="bg-black px-2.5 py-1 rounded border border-zinc-800">Discard: <strong className="text-white">{gameState.discard?.length || 0}</strong></span>
                    </div>
                    <span className="text-amber-500 font-bold uppercase tracking-widest bg-amber-950/30 px-3 py-1 rounded border border-amber-900/40">
                        Phase: {gameState.status?.replace('_', ' ')}
                    </span>
                </div>

                <div className="space-y-8">
                    {/* Liberal Track */}
                    <div className="relative bg-[#06101e] p-4 sm:p-5 rounded-xl border border-blue-900/50 shadow-inner">
                        <span className="absolute -top-3 left-4 bg-blue-900 text-blue-100 px-3 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">Liberal Policies</span>
                        <div className="flex gap-2 sm:gap-3 overflow-x-auto justify-center pb-1 pt-2">
                            {libTrack.map(i => (
                                <div key={`lib-${i}`} className="w-14 h-20 sm:w-28 sm:h-40 border-2 border-blue-900/60 rounded-lg flex items-center justify-center relative bg-black/80 shrink-0">
                                    {i < gameState.liberal ? (
                                        <div className="absolute inset-1 sm:inset-2 bg-blue-600 rounded shadow-[0_0_15px_rgba(37,99,235,0.8)] border border-blue-400 flex items-center justify-center">
                                            <span className="text-white font-serif text-2xl sm:text-5xl font-black">L</span>
                                        </div>
                                    ) : (i === 4 ? <span className="text-blue-500/40 text-[9px] sm:text-xs font-black text-center leading-tight">LIBERAL<br/>VICTORY</span> : null)}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Fascist Track */}
                    <div className="relative bg-[#1c0606] p-4 sm:p-5 rounded-xl border border-red-900/50 shadow-inner">
                        <span className="absolute -top-3 left-4 bg-red-900 text-red-100 px-3 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">Fascist Policies</span>
                        <div className="flex gap-2 sm:gap-3 overflow-x-auto justify-center pb-1 pt-2">
                            {fasTrack.map(i => {
                                let powerLabel = '';
                                const pCount = gameState.players.length;
                                if (pCount <= 6) {
                                    if (i === 2) powerLabel = 'PEEK';
                                    if (i === 3 || i === 4) powerLabel = 'EXECUTION';
                                } else if (pCount <= 8) {
                                    if (i === 1) powerLabel = 'INVESTIGATE';
                                    if (i === 2) powerLabel = 'SPECIAL ELEC';
                                    if (i === 3 || i === 4) powerLabel = 'EXECUTION';
                                } else {
                                    if (i === 0 || i === 1) powerLabel = 'INVESTIGATE';
                                    if (i === 2) powerLabel = 'SPECIAL ELEC';
                                    if (i === 3 || i === 4) powerLabel = 'EXECUTION';
                                }
                                if (i === 5) powerLabel = 'FASCIST WIN';

                                return (
                                    <div key={`fas-${i}`} className="w-14 h-20 sm:w-28 sm:h-40 border-2 border-red-900/60 rounded-lg flex flex-col items-center justify-center relative bg-black/80 shrink-0 p-1">
                                        {!(i < gameState.fascist) && powerLabel && (
                                            <span className="text-red-500/40 text-[8px] sm:text-[11px] font-black text-center leading-tight uppercase tracking-wider">{powerLabel}</span>
                                        )}
                                        {i < gameState.fascist && (
                                            <div className="absolute inset-1 sm:inset-2 bg-red-800 rounded shadow-[0_0_15px_rgba(185,28,28,0.8)] border border-red-500 flex items-center justify-center">
                                                <LucideSkull className="w-6 h-6 sm:w-12 sm:h-12 text-black/50" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Election Tracker */}
                <div className="bg-black/60 p-4 rounded-xl border border-zinc-900 flex flex-col items-center">
                    <span className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Election Tracker</span>
                    <div className="flex gap-6 items-center">
                        {[0, 1, 2, 3].map(i => (
                            <div key={`track-${i}`} className="flex flex-col items-center gap-1">
                                <div className={`w-8 h-8 rounded-full border-2 ${i === 3 ? 'border-red-600 bg-red-950/40' : 'border-zinc-700 bg-zinc-900'} flex items-center justify-center relative`}>
                                    {gameState.tracker === i && <div className="w-4 h-4 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,1)]" />}
                                </div>
                                {i === 3 && <span className="text-[9px] font-bold text-red-500 uppercase">Chaos</span>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const ViewRoleReveal = () => {
        const me = getMyPlayer();
        if (!me) return null;
        
        const isReady = gameState.readyToReveal?.includes(me.uid);
        const [showRole, setShowRole] = useState(false);

        const pCount = gameState.players.length;
        const fascists = gameState.players.filter(p => p.role === ROLE_FASCIST);
        const hitler = gameState.players.find(p => p.role === ROLE_HITLER);
        
        let teammateKnowledge = null;
        if (me.role === ROLE_FASCIST) {
            const fascistNames = fascists.filter(f => f.uid !== me.uid).map(f => f.name).join(', ');
            teammateKnowledge = (
                <div className="mt-4 text-xs bg-black/80 p-3 rounded-lg border border-red-900/60 text-left space-y-1">
                    <p className="text-red-400"><strong className="text-white">Hitler:</strong> {hitler?.name}</p>
                    {fascistNames && <p className="text-red-400"><strong className="text-white">Other Fascists:</strong> {fascistNames}</p>}
                </div>
            );
        } else if (me.role === ROLE_HITLER && pCount <= 6) {
            teammateKnowledge = (
                <div className="mt-4 text-xs bg-black/80 p-3 rounded-lg border border-red-900/60 text-left">
                    <p className="text-red-400"><strong className="text-white">Your Fascist Teammate:</strong> {fascists[0]?.name}</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] p-4 text-center">
                {isReady ? (
                    <div className="bg-zinc-950 p-8 rounded-2xl border border-zinc-800 space-y-3">
                        <LucideCheck className="w-12 h-12 text-green-500 mx-auto" />
                        <h2 className="text-lg font-black text-white uppercase tracking-widest">Role Confirmed</h2>
                        <p className="text-xs text-gray-500">Waiting for other players...</p>
                    </div>
                ) : (
                    <div className="max-w-xs w-full space-y-4">
                        <h2 className="text-lg font-black text-white uppercase tracking-widest">Secret Identity</h2>
                        
                        {!showRole ? (
                            <button onPointerDown={() => setShowRole(true)} onPointerUp={() => setShowRole(false)} onPointerLeave={() => setShowRole(false)} className="w-full h-56 bg-zinc-950 border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center cursor-pointer shadow-2xl hover:bg-zinc-900 transition active:scale-95">
                                <LucideEye className="w-12 h-12 text-gray-600 mb-2" />
                                <span className="font-bold text-xs uppercase tracking-widest text-gray-400">Hold to Reveal Card</span>
                            </button>
                        ) : (
                            <div className={`w-full p-6 rounded-2xl border-4 shadow-2xl flex flex-col items-center justify-center bg-black transition-all ${me.role === ROLE_LIBERAL ? 'border-blue-600' : 'border-red-600'}`}>
                                <h3 className={`text-3xl font-black uppercase tracking-widest mb-2 ${me.role === ROLE_LIBERAL ? 'text-blue-500' : 'text-red-600'}`}>{me.role}</h3>
                                {me.role === ROLE_LIBERAL ? <LucideShield className="w-16 h-16 text-blue-500" /> : <LucideSkull className="w-16 h-16 text-red-600" />}
                                {teammateKnowledge}
                            </div>
                        )}
                        <button onClick={handleAcknowledgeReveal} className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-xs uppercase tracking-widest mt-4">
                            I Memorized My Role
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const ViewNomination = () => {
        const me = getMyPlayer();
        const currentPres = gameState.players[gameState.presidentIndex];
        const isMePres = me?.uid === currentPres.uid;
        const alivePlayers = getAlivePlayers();

        const eligibleChancellors = alivePlayers.filter(p => 
            p.uid !== currentPres.uid && p.uid !== gameState.prevChancellorId &&
            (alivePlayers.length <= 5 || p.uid !== gameState.prevPresidentId)
        );

        if (isMePres) {
            return (
                <div className="space-y-4 max-w-md mx-auto w-full">
                    <div className="bg-blue-950/40 border border-blue-900 p-5 rounded-2xl text-center">
                        <h2 className="text-xl font-black text-blue-400 uppercase tracking-widest">You are President</h2>
                        <p className="text-xs text-gray-400 mt-1">Select a candidate to nominate for Chancellor.</p>
                    </div>
                    <div className="grid gap-2">
                        {eligibleChancellors.map(p => (
                            <button key={p.uid} onClick={() => updateGame({ nominatedId: p.uid, status: 'voting' })} className="bg-zinc-950 hover:bg-blue-950/60 p-4 rounded-xl text-white font-bold flex justify-between items-center border border-zinc-800 transition">
                                <span className="text-sm">{p.name}</span>
                                <LucideCheck className="w-5 h-5 text-gray-600" />
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        return (
            <div className="text-center p-8 bg-zinc-950 rounded-2xl border border-zinc-800 max-w-md mx-auto w-full shadow-2xl">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Presidential Nomination</p>
                <div className="text-lg text-white font-bold">
                    President <span className="text-blue-400 font-black">{currentPres.name}</span> is choosing a Chancellor...
                </div>
            </div>
        );
    };

    const ViewVoting = () => {
        const me = getMyPlayer();
        if (!me || me.isDead) return <div className="text-center p-8 bg-zinc-950 rounded-2xl text-gray-500 font-bold">You are eliminated. Spectating...</div>;

        const hasVoted = !!gameState.votes[me.uid];
        const currentPres = gameState.players[gameState.presidentIndex];
        const nominee = gameState.players.find(p => p.uid === gameState.nominatedId);

        if (hasVoted) {
            return (
                <div className="text-center p-8 bg-zinc-950 rounded-2xl border border-zinc-800 max-w-md mx-auto w-full">
                    <LucideCheck className="w-10 h-10 text-green-500 mx-auto mb-2" />
                    <h3 className="text-base font-black text-white uppercase tracking-widest">Vote Submitted</h3>
                    <p className="text-xs text-gray-500 mt-1 animate-pulse">Awaiting remaining player votes...</p>
                </div>
            );
        }

        return (
            <div className="max-w-md mx-auto w-full text-center space-y-4">
                <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800">
                    <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Proposed Government</h2>
                    <div className="flex flex-col gap-1 text-xl font-black">
                        <span className="text-blue-400">Pres: {currentPres.name}</span>
                        <span className="text-amber-400">Chanc: {nominee?.name}</span>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => updateGame({ votes: { ...gameState.votes, [me.uid]: 'ja' } })} className="flex-1 bg-gradient-to-br from-green-700 to-green-900 hover:from-green-600 text-green-100 py-10 rounded-2xl font-black text-3xl uppercase tracking-widest shadow-xl transition active:scale-95">JA</button>
                    <button onClick={() => updateGame({ votes: { ...gameState.votes, [me.uid]: 'nein' } })} className="flex-1 bg-gradient-to-br from-red-800 to-red-950 hover:from-red-700 text-red-100 py-10 rounded-2xl font-black text-3xl uppercase tracking-widest shadow-xl transition active:scale-95">NEIN</button>
                </div>
            </div>
        );
    };

    const ViewLegislative = () => {
        const me = getMyPlayer();
        const isPres = me?.uid === gameState.players[gameState.presidentIndex].uid && gameState.status === 'president_discard';
        const isChanc = me?.uid === gameState.chancellorId && gameState.status === 'chancellor_discard';

        if (isPres || isChanc) {
            const title = isPres ? 'President Phase' : 'Chancellor Phase';
            const subtitle = isPres ? 'Select ONE Policy Card to DISCARD' : 'Select ONE Policy Card to ENACT';

            return (
                <div className="max-w-md mx-auto w-full space-y-6">
                    <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-2xl text-center">
                        <h2 className="text-lg font-black text-white uppercase tracking-widest">{title}</h2>
                        <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
                    </div>
                    <div className="flex justify-center gap-3">
                        {gameState.drawn.map((card, i) => (
                            <button key={i} onClick={async () => {
                                if (isPres) {
                                    const newDrawn = [...gameState.drawn];
                                    const discarded = newDrawn.splice(i, 1)[0];
                                    await updateGame({ status: 'chancellor_discard', drawn: newDrawn, discard: [...gameState.discard, discarded] });
                                } else {
                                    const discardedCard = i === 0 ? gameState.drawn[1] : gameState.drawn[0];
                                    await updateGame({ discard: [...gameState.discard, discardedCard] });
                                    await enactPolicy(card, gameState);
                                }
                            }} className={`w-28 h-40 rounded-xl border-2 flex items-center justify-center font-serif text-4xl shadow-2xl transition hover:-translate-y-2 ${card === 'L' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-red-800 border-red-500 text-white'}`}>
                                {card}
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        return (
            <div className="text-center p-8 bg-zinc-950 rounded-2xl border border-zinc-800 max-w-md mx-auto w-full">
                <LucideRefreshCw className="w-8 h-8 text-gray-600 animate-spin mx-auto mb-2" />
                <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">Legislative Session</h2>
                <p className="text-sm font-bold text-white mt-1">Government is considering policies...</p>
            </div>
        );
    };

    const ViewExecutivePower = () => {
        const me = getMyPlayer();
        const isPres = me?.uid === gameState.players[gameState.presidentIndex].uid;
        const power = gameState.activePower;

        if (!isPres) {
            return (
                <div className="text-center p-8 bg-zinc-950 rounded-2xl border border-zinc-800 max-w-md mx-auto w-full">
                    <LucideZap className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">Executive Action</h2>
                    <p className="text-sm font-bold text-white mt-1">President is executing dynamic power: {power?.toUpperCase()}</p>
                </div>
            );
        }

        const closePower = () => updateGame({ status: 'nominate', activePower: null, presidentIndex: getNextPresidentIndex(gameState) });
        const targets = gameState.players.filter(p => !p.isDead && p.uid !== me.uid);

        if (power === 'peek') {
            return (
                <div className="max-w-md mx-auto w-full space-y-4 text-center">
                    <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800">
                        <h2 className="text-lg font-black text-amber-500 uppercase tracking-widest">Policy Peek</h2>
                        <p className="text-xs text-gray-400 mt-1">You may view the top 3 policy cards.</p>
                    </div>
                    {!peekCards ? (
                        <button onClick={() => setPeekCards(gameState.deck.slice(0, 3))} className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl uppercase tracking-widest text-xs">Peek Cards</button>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-center gap-3">
                                {peekCards.map((c, i) => (
                                    <div key={i} className={`w-20 h-28 rounded-lg border-2 flex items-center justify-center font-serif text-2xl ${c === 'L' ? 'bg-blue-600 border-blue-400' : 'bg-red-800 border-red-500'}`}>{c}</div>
                                ))}
                            </div>
                            <button onClick={() => { setPeekCards(null); closePower(); }} className="w-full py-3 bg-zinc-800 text-white font-bold rounded-xl text-xs uppercase tracking-widest">Done</button>
                        </div>
                    )}
                </div>
            );
        }

        if (power === 'execution') {
            return (
                <div className="max-w-md mx-auto w-full space-y-4">
                    <div className="bg-red-950/60 border border-red-900 p-5 rounded-2xl text-center">
                        <LucideSkull className="w-8 h-8 text-red-500 mx-auto mb-1" />
                        <h2 className="text-lg font-black text-red-500 uppercase tracking-widest">Execution Power</h2>
                    </div>
                    <div className="grid gap-2">
                        {targets.map(p => (
                            <button key={p.uid} onClick={async () => {
                                const isTargetHitler = p.role === ROLE_HITLER;
                                const updatedPlayers = gameState.players.map(pl => pl.uid === p.uid ? { ...pl, isDead: true } : pl);
                                if (isTargetHitler) {
                                    await updateGame({ status: 'game_over', winner: 'Liberals', players: updatedPlayers, activePower: null });
                                } else {
                                    await updateGame({ status: 'nominate', players: updatedPlayers, activePower: null, presidentIndex: getNextPresidentIndex(gameState) });
                                }
                            }} className="bg-zinc-950 hover:bg-red-950 p-4 rounded-xl text-white font-bold flex justify-between items-center border border-zinc-800">
                                <span>{p.name}</span><LucideSkull className="w-4 h-4 text-red-500" />
                            </button>
                        ))}
                    </div>
                </div>
            );
        }

        if (power === 'investigate') {
             return (
                <div className="max-w-md mx-auto w-full space-y-4 text-center">
                    <div className="bg-purple-950/60 border border-purple-900 p-5 rounded-2xl text-center">
                        <LucideSearch className="w-8 h-8 text-purple-500 mx-auto mb-1" />
                        <h2 className="text-lg font-black text-purple-400 uppercase tracking-widest">Investigate Loyalty</h2>
                    </div>
                    {!investigationResult ? (
                        <div className="grid gap-2">
                            {targets.map(p => (
                                <button key={p.uid} onClick={() => setInvestigationResult(p)} className="bg-zinc-950 hover:bg-purple-950 p-4 rounded-xl text-white font-bold border border-zinc-800">Investigate {p.name}</button>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800">
                                <p className="text-gray-400 text-xs mb-2 uppercase tracking-widest">{investigationResult.name}'s Party Membership is:</p>
                                <p className={`text-3xl font-black uppercase tracking-widest ${investigationResult.role === ROLE_FASCIST || investigationResult.role === ROLE_HITLER ? 'text-red-500' : 'text-blue-500'}`}>
                                    {investigationResult.role === ROLE_FASCIST || investigationResult.role === ROLE_HITLER ? 'FASCIST' : 'LIBERAL'}
                                </p>
                            </div>
                            <button onClick={() => { setInvestigationResult(null); closePower(); }} className="w-full py-3 bg-zinc-800 text-white font-bold rounded-xl text-xs uppercase tracking-widest">Done</button>
                        </div>
                    )}
                </div>
            );
        }

        if (power === 'special_election') {
             return (
                <div className="max-w-md mx-auto w-full space-y-4">
                    <div className="bg-blue-950/60 border border-blue-900 p-5 rounded-2xl text-center">
                        <h2 className="text-lg font-black text-blue-400 uppercase tracking-widest">Special Election</h2>
                        <p className="text-xs text-gray-300">Choose the next Presidential candidate.</p>
                    </div>
                    <div className="grid gap-2">
                        {targets.map(p => (
                            <button key={p.uid} onClick={() => {
                                updateGame({ 
                                    status: 'nominate', activePower: null, 
                                    specialElectionNextPres: gameState.players.findIndex(pl => pl.uid === p.uid),
                                    presidentIndex: gameState.players.findIndex(pl => pl.uid === p.uid)
                                });
                            }} className="bg-zinc-950 hover:bg-blue-950/60 p-4 rounded-xl text-white font-bold border border-zinc-800">Make {p.name} President</button>
                        ))}
                    </div>
                </div>
            );
        }

        return <button onClick={closePower} className="w-full py-4 bg-zinc-800 text-white font-bold rounded-xl text-xs uppercase tracking-widest">Continue Game</button>;
    };

    const ViewGameOver = () => (
        <div className="max-w-md mx-auto w-full text-center space-y-6 p-6 bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl">
            <h1 className="text-4xl font-black text-white uppercase tracking-widest">Game Over</h1>
            <div className={`p-6 rounded-xl border-2 ${gameState.winner === 'Liberals' ? 'bg-blue-950/40 border-blue-500 text-blue-400' : 'bg-red-950/40 border-red-600 text-red-500'}`}>
                <h2 className="text-3xl font-black uppercase tracking-widest">{gameState.winner} Victory</h2>
            </div>
            <div className="bg-black p-4 rounded-xl border border-zinc-900 text-left space-y-2">
                <h3 className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2 border-b border-zinc-800 pb-1">Role Identities</h3>
                {gameState.players.map(p => (
                    <div key={p.uid} className="flex justify-between items-center text-xs py-1">
                        <span className={`font-bold ${p.isDead ? 'line-through text-gray-600' : 'text-white'}`}>{p.name}</span>
                        <span className={`font-black uppercase tracking-widest ${p.role === ROLE_LIBERAL ? 'text-blue-400' : 'text-red-500'}`}>{p.role}</span>
                    </div>
                ))}
            </div>
            {gameState.hostId === user?.uid && (
                <button onClick={() => updateGame({ status: 'lobby', players: gameState.players.map(p => ({ ...p, role: null, isDead: false })) })} className="w-full py-4 bg-red-700 hover:bg-red-600 text-white font-black rounded-xl uppercase tracking-widest text-xs">Return to Lobby</button>
            )}
        </div>
    );

    const ActiveGame = () => {
        const isHostDev = isHostDevice();
        return (
            <div className="flex flex-col min-h-[calc(100vh-70px)] p-4 md:p-6">
                <div className="flex-1 flex flex-col gap-6 max-w-6xl mx-auto w-full">
                    {(isHostDev || gameState.mode === 'online') && <CentralBoard />}
                    {!isHostDev && (
                        <div className="flex-1 flex flex-col justify-center py-4">
                            {gameState.status === 'reveal' && <ViewRoleReveal />}
                            {gameState.status === 'nominate' && <ViewNomination />}
                            {gameState.status === 'voting' && <ViewVoting />}
                            {(gameState.status === 'president_discard' || gameState.status === 'chancellor_discard') && <ViewLegislative />}
                            {gameState.status === 'executive_power' && <ViewExecutivePower />}
                            {gameState.status === 'game_over' && <ViewGameOver />}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-black text-slate-100 font-sans">
            <Notification />
            
            {view === 'auth' && <ViewAuth />}
            
            {view !== 'auth' && (
                <>
                    <TopBar />
                    {view === 'home' && <ViewHome />}
                    {view === 'create' && <ViewCreate />}
                    {view === 'join' && <ViewJoin />}
                    {view === 'lobby' && <ViewLobby />}
                    {view === 'game' && <ActiveGame />}
                    {view === 'profile' && <ViewProfile />}
                    {view === 'leaderboard' && <ViewLeaderboard />}
                </>
            )}
        </div>
    );
}