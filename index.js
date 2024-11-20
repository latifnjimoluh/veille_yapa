import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';


dotenv.config(); // Charge les variables d'environnement depuis le fichier .env

const app = express();
const PORT = process.env.PORT || 3000;

// Récupérer les tokens et autres informations sensibles depuis le fichier .env
const notionToken = process.env.NOTION_TOKEN;
const notionVersion = process.env.NOTION_VERSION;


app.use(express.json());



// Route pour lister les bases de données
app.get('/api/databases', async (req, res) => {
    try {
        const response = await axios.post(
            'https://api.notion.com/v1/search',
            {
                filter: {
                    property: 'object',
                    value: 'database'
                }
            },
            {
                headers: {
                    "Authorization": `Bearer ${notionToken}`,
                    "Notion-Version": notionVersion
                },
                timeout: 10000 // Augmenter le délai d'attente à 10 secondes
            }
        );

        if (!response.data || !response.data.results) {
            throw new Error("Réponse de Notion vide ou mal formée");
        }

        const databases = response.data.results.map(db => ({
            name: db.title[0]?.text?.content || 'Sans titre',
            id: db.id
        }));

        res.status(200).json({
            success: true,
            databases
        });
    } catch (error) {
        console.error("Erreur lors de la récupération des bases de données :", error.message || error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération des bases de données",
            error: error.message || error
        });
    }
});


app.get('/api/databases/:id', async (req, res) => {
    const databaseId = req.params.id;

    try {
        const response = await axios.post(
            `https://api.notion.com/v1/databases/${databaseId}/query`,
            {},
            {
                headers: {
                    "Authorization": `Bearer ${notionToken}`,
                    "Notion-Version": notionVersion
                }
            }
        );

        if (!response.data || !response.data.results) {
            throw new Error("Réponse de Notion vide ou mal formée");
        }

        // Extraction et formatage des données souhaitées
        const filteredResults = response.data.results.map((result) => {
            const props = result.properties;
            return {
                identifiant: props["Identifiant"]?.unique_id?.number || null,
                nom_concurrent: props["Nom du concurrent"]?.title?.[0]?.plain_text || null,
                services_offerts: props["Services offerts"]?.rich_text?.[0]?.plain_text || null,
                forces: props["Forces"]?.rich_text?.[0]?.plain_text || null,
                faiblesses: props["Faiblesses"]?.rich_text?.[0]?.plain_text || null,
                opportunites_diff: props["Opportunités de différenciation pour YAPA"]?.rich_text?.[0]?.plain_text || null,
                technologies_utilisees: props["Technologies utilisées"]?.rich_text?.[0]?.plain_text || null,
                url_source: props["URL/Source"]?.url || null,
                notes_supplementaires: props["Notes supplémentaires"]?.select || null,
                recherche_concurrents: props["Recherche des concurrents"]?.rich_text?.[0]?.plain_text || null,
                analyse_fonctionnalites: props["Analyse des fonctionnalités"]?.rich_text?.[0]?.plain_text || null,
                differenciation: props["Différenciation"]?.rich_text?.[0]?.plain_text || null,
                competitor_status: props["Competitor Status"]?.status?.name || null,
                titre: props["Titre"]?.rich_text?.[0]?.plain_text || null,
                content: props["Content"]?.rich_text?.[0]?.plain_text || null,
                last_updated: props["Last Updated"]?.date?.start || null,
            };
        });

        res.status(200).json({
            success: true,
            results: filteredResults
        });
    } catch (error) {
        console.error("Erreur lors de la récupération des données :", error.message || error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération des données",
            error: error.message || error
        });
    }
});



// Lancement du serveur
app.listen(PORT, () => {
    console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
