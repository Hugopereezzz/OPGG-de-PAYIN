const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors({
    origin: 'http://localhost:4200',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const key = process.env.RIOT_API_KEY;
const config = { headers: { "X-Riot-Token": key } };

// DYNAMIC VERSIONING
let DDRAGON_VERSION = '14.6.1';
async function fetchLatestVersion() {
    try {
        const res = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
        DDRAGON_VERSION = res.data[0];
        console.log(`✅ Data Dragon Version: ${DDRAGON_VERSION}`);
    } catch (e) {
        console.error("❌ Fallo cargando versión de Dagon");
    }
}
fetchLatestVersion();

// BASE DE DATOS: Inicialización de tabla
async function setupDB() {
    const query = `
        CREATE TABLE IF NOT EXISTS lp_history (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(255) NOT NULL,
            tag VARCHAR(255) NOT NULL,
            lp INTEGER NOT NULL,
            tier VARCHAR(50),
            rank VARCHAR(10),
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await pool.query(query);
        console.log("✅ Tabla lp_history lista");
    } catch (e) {
        console.error("❌ Error inicializando DB:", e);
    }
}
setupDB();

// Lista maestra de colegas
const MIS_COLEGAS = [
    { nombre: 'Nosaka', tag: 'PAYIN' },
    { nombre: 'JOY BOY', tag: 'Taxon' },
    { nombre: 'SCREAM DIFF', tag: 'HIG' },
    { nombre: 'SCREAM', tag: 'NFF' },
    { nombre: 'manelmr', tag: 'MANZ' },
    { nombre: 'Kirddat', tag: 'roro' },
    { nombre: 'M4rt0s', tag: '777' },
];

// Helper para guardar historial y calcular diferencia
async function handleLPHistory(nombre, tag, lp, tier, rank) {
    try {
        const lastRec = await pool.query(
            "SELECT lp, timestamp FROM lp_history WHERE nombre = $1 AND tag = $2 ORDER BY timestamp DESC LIMIT 1",
            [nombre, tag]
        );

        let diff = 0;
        if (lastRec.rows.length > 0) {
            const lastLP = lastRec.rows[0].lp;
            diff = lp - lastLP;

            const horasDesdeUltimo = (new Date() - new Date(lastRec.rows[0].timestamp)) / (1000 * 60 * 60);
            if (diff !== 0 || horasDesdeUltimo > 12) {
                await pool.query(
                    "INSERT INTO lp_history (nombre, tag, lp, tier, rank) VALUES ($1, $2, $3, $4, $5)",
                    [nombre, tag, lp, tier, rank]
                );
            }
        } else {
            await pool.query(
                "INSERT INTO lp_history (nombre, tag, lp, tier, rank) VALUES ($1, $2, $3, $4, $5)",
                [nombre, tag, lp, tier, rank]
            );
        }
        return diff;
    } catch (e) {
        console.error("Error en handleLPHistory:", e);
        return 0;
    }
}

app.get('/version', (req, res) => res.json({ version: DDRAGON_VERSION }));

app.get('/scouting-multi', async (req, res) => {
    try {
        const promesas = MIS_COLEGAS.map(async (c) => {
            const rAcc = await axios.get(`https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${c.nombre}/${c.tag}`, config);
            const puuid = rAcc.data.puuid;
            const rLeague = await axios.get(`https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`, config);
            const soloQ = rLeague.data.find(q => q.queueType === "RANKED_SOLO_5x5") || { tier: "UNRANKED", rank: "", leaguePoints: 0, wins: 0, losses: 0 };

            const diff = await handleLPHistory(c.nombre, c.tag, soloQ.leaguePoints, soloQ.tier, soloQ.rank);

            return {
                nombre: c.nombre,
                tag: c.tag,
                rango: soloQ.tier,
                division: soloQ.rank,
                lp: soloQ.leaguePoints,
                lp_diff: diff,
                wins: soloQ.wins,
                losses: soloQ.losses,
                wr: soloQ.wins + soloQ.losses > 0 ? Math.round((soloQ.wins / (soloQ.wins + soloQ.losses)) * 100) : 0
            };
        });
        const resultados = await Promise.all(promesas);
        res.json(resultados);
    } catch (e) {
        res.status(500).json({ error: "Error en carga múltiple" });
    }
});

app.get('/scouting/:nombre/:tag', async (req, res) => {
    const { nombre, tag } = req.params;
    try {
        const resAcc = await axios.get(`https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${nombre}/${tag}`, config);
        const puuid = resAcc.data.puuid;
        const resLeague = await axios.get(`https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`, config);
        const soloQ = resLeague.data.find(q => q.queueType === "RANKED_SOLO_5x5") || { tier: "UNRANKED", rank: "", leaguePoints: 0, wins: 0, losses: 0 };

        // Sincronizar puntos actuales antes de calcular el historial
        await handleLPHistory(nombre, tag, soloQ.leaguePoints, soloQ.tier, soloQ.rank);

        const resMatches = await axios.get(`https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=5`, config);

        let history = [];
        try {
            const resHistory = await pool.query(
                "SELECT lp, timestamp FROM lp_history WHERE nombre = $1 AND tag = $2 ORDER BY timestamp ASC",
                [nombre, tag]
            );
            history = resHistory.rows;
        } catch (dbError) {
            console.error("Error cargando el historial de LP:", dbError.message);
        }

        let partidasInfo = [];
        for (const id of resMatches.data) {
            const m = await axios.get(`https://europe.api.riotgames.com/lol/match/v5/matches/${id}`, config);
            const info = m.data.info;
            const p = info.participants.find(part => part.puuid === puuid);

            const gameEnd = info.gameCreation + (info.gameDuration * 1000);

            // Buscar snapshot inmediatamente después de la partida
            const after = history.find(h => new Date(h.timestamp).getTime() > gameEnd);
            let lpChange = null;
            if (after) {
                // Buscar snapshot inmediatamente antes de ese 'after'
                const afterIndex = history.indexOf(after);
                if (afterIndex > 0) {
                    const before = history[afterIndex - 1];
                    lpChange = after.lp - before.lp;
                }
            }

            let maxDamage = 0;
            for (const part of info.participants) {
                if (part.totalDamageDealtToChampions > maxDamage) {
                    maxDamage = part.totalDamageDealtToChampions;
                }
            }

            const playerDamage = p.totalDamageDealtToChampions;
            const damagePercent = maxDamage > 0 ? (playerDamage / maxDamage) * 100 : 0;

            const date = new Date(info.gameCreation);
            const msAgo = Date.now() - date.getTime();
            const hoursAgo = Math.floor(msAgo / (1000 * 60 * 60));
            const daysAgo = Math.floor(hoursAgo / 24);
            const tiempoAtras = daysAgo > 0 ? `Hace ${daysAgo} d` : `Hace ${hoursAgo} h`;

            const cs = p.totalMinionsKilled + p.neutralMinionsKilled;
            const gameDuration = info.gameDuration;
            const minutos = gameDuration / 60;
            const csMin = (cs / minutos).toFixed(1);

            const durMins = Math.floor(gameDuration / 60);
            const durSecs = gameDuration % 60;
            const durStr = `${durMins}:${durSecs.toString().padStart(2, '0')}`;

            const deathsForRatio = p.deaths === 0 ? 1 : p.deaths;
            const ratioKda = ((p.kills + p.assists) / deathsForRatio).toFixed(2);
            const danoMin = (playerDamage / minutos).toFixed(1);

            const spellMap = { 1: "SummonerBoost", 3: "SummonerExhaust", 4: "SummonerFlash", 6: "SummonerHaste", 7: "SummonerHeal", 11: "SummonerSmite", 12: "SummonerTeleport", 13: "SummonerMana", 14: "SummonerDot", 21: "SummonerBarrier", 32: "SummonerSnowball" };
            const s1Name = spellMap[p.summoner1Id] || 'SummonerFlash';
            const s2Name = spellMap[p.summoner2Id] || 'SummonerHeal';

            partidasInfo.push({
                campeon: p.championName,
                nivel: p.champLevel,
                kills: p.kills,
                deaths: p.deaths,
                assists: p.assists,
                kda_ratio: ratioKda,
                cs: cs,
                cs_min: csMin,
                tiempo_atras: tiempoAtras,
                hechizos: [s1Name, s2Name],
                objetos: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6],
                dano: playerDamage,
                dano_porcentaje: Math.round(damagePercent),
                dano_min: danoMin,
                duracion: durStr,
                lp_change: lpChange,
                resultado: p.win ? "Victoria" : "Derrota"
            });
        }
        res.json({
            jugador: `${nombre}#${tag}`,
            rango: `${soloQ.tier} ${soloQ.rank}`,
            puntos: soloQ.leaguePoints,
            winrate: soloQ.wins + soloQ.losses > 0 ? ((soloQ.wins / (soloQ.wins + soloQ.losses)) * 100).toFixed(1) + "%" : "0%",
            ultimas_partidas: partidasInfo
        });
    } catch (error) {
        console.error("DEBUG ERROR SCOUTING:", error.response?.data || error.message);
        res.status(500).json({ error: "Fallo en el scouting", message: error.message, stack: error.stack, responseData: error.response?.data });
    }
});

// SERVIR FRONTEND
app.use(express.static(path.join(__dirname, '../frontend/dist/frontend/browser')));

// RUTA PARA ANGULAR (Cualquier ruta no API redirige a index.html)
app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/frontend/browser/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server en puerto ${PORT}`));