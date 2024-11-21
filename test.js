

import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import nodemailer from 'nodemailer';
import moment from 'moment';


dotenv.config(); // Charge les variables d'environnement depuis le fichier .env

const app = express();
const PORT = process.env.PORT || 3000;

// Récupérer les tokens et autres informations sensibles depuis le fichier .env
const notionToken = process.env.NOTION_TOKEN;
const notionVersion = process.env.NOTION_VERSION;
const geminiApiKey = process.env.GEMINI_API_KEY;
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;

// Configurer l'IA générative (Gemini)
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Configurer Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: emailUser, // Votre email
        pass: emailPass  // Votre mot de passe ou token d'application
    }
});


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
                competitor_status: props["Competitor Status"]?.select?.name || null,
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

// Fonction pour gérer les tentatives de requêtes
const retryRequest = async (func, retries = 5, delay = 5000) => {
    let attempt = 0;
    while (attempt < retries) {
        try {
            return await func();
        } catch (error) {
            if (attempt < retries - 1) {
                console.log(`Retrying... (${attempt + 1})`);
                await new Promise(resolve => setTimeout(resolve, delay)); // Attendre avant de réessayer
            } else {
                throw error;
            }
        }
        attempt++;
    }
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

app.post('/api/gemini-techno/:notionDatabaseId', async (req, res) => {
    const { notionDatabaseId } = req.params;
    const { recipientEmail } = req.body;

    if (!notionDatabaseId) {
        return res.status(400).json({ error: "L'ID de la base Notion est requis." });
    }

    if (!recipientEmail) {
        return res.status(400).json({ error: "L'email du destinataire est requis." });
    }

    try {
        // Étape 1 : Récupérer les données depuis Notion avec le filtre sur le statut "Debut"
        const notionResponse = await axios.post(
            `https://api.notion.com/v1/databases/${notionDatabaseId}/query`,
            {
                filter: {
                    property: 'Competitor Status',
                    select: {
                        equals: 'Debut'
                    }
                }
            },
            {
                headers: {
                    "Authorization": `Bearer ${notionToken}`,
                    "Notion-Version": notionVersion
                }
            }
        );

        if (!notionResponse.data || !notionResponse.data.results) {
            throw new Error("Réponse de Notion vide ou mal formée.");
        }

        const notionData = notionResponse.data.results.map((result) => {
            const props = result.properties;
            return {
                id: result.id,
                identifiant: props["Identifiant"]?.unique_id?.number || 'Non défini',
                titre: props["Titre"]?.rich_text?.[0]?.plain_text || 'Sans Titre',
                url: props["URL/Source"]?.url || 'Non disponible',
                date: props["Date de publication"]?.date?.start || 'Pas de date',
                content: props["Content"]?.rich_text?.[0]?.plain_text || 'Pas de contenu',
                competitorStatus: props["Competitor Status"]?.select?.name || null
            };
        });

        // Étape 2 : Générer et envoyer le prompt à Gemini pour chaque donnée séparément
        for (const data of notionData) {
            const prompt = `
                Voici les informations sur mon projet :
                YAPA est une solution d'agrégation de paiements accessible à la fois en tant qu'application web et mobile. 
                Voici les informations sur un concurrent :

                URL : ${data.url}
                Titre : ${data.titre}
                Contenu : ${data.content}
                Date de publication : ${data.date}

                Recherche le nom du concurrent à partir de ces informations et donne uniquement le nom.
                Tu vas uniquement dire Le nom est: 'le_nom'
            `;

            let generatedText = null;
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const geminiResponse = await model.generateContent(prompt);
                const responseAI = await geminiResponse.response;
                generatedText = await responseAI.text();
            } catch (geminiError) {
                console.error("Erreur Gemini :", geminiError.message || geminiError);
            }

            // Étape 1 : Extraire uniquement le nom du concurrent après "Le nom est: "
            const regex = /Le nom est : (.+)/; // Recherche du texte après "Le nom est : "
            const match = generatedText?.trim().match(regex);

            let competitorName = null;
            if (match && match[1]) {
                competitorName = match[1].trim(); // Le nom du concurrent
            } else {
                console.log("Nom du concurrent non trouvé dans la réponse Gemini.");
            }

            // Mise à jour de Notion avec le nom extrait du texte généré
            if (competitorName) {
                try {
                    await axios.patch(
                        `https://api.notion.com/v1/pages/${data.id}`,
                        {
                            properties: {
                                "Nom du concurrent": {
                                    title: [
                                        {
                                            text: {
                                                content: competitorName // Enregistrer le nom extrait
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            headers: {
                                "Authorization": `Bearer ${notionToken}`,
                                "Notion-Version": notionVersion
                            }
                        }
                    );
                } catch (updateError) {
                    console.error("Erreur lors de la mise à jour de Notion :", updateError.message || updateError);
                }
            }
            console.log("Le nom est ", competitorName);
            // Étape 3 : Préparer et envoyer l'email avec les données et le prompt
            const emailContent = `
                <html>
                    <body>
                        <h2 style="color:#2C3E50;">Rapport de Veille Technologique</h2>
                        <p><strong>Bonjour,</strong></p>
                        <p>Voici les données issues de votre base Notion :</p>
                        <ul>
                            <li>
                                <h3 style="color:#2980B9;"><strong>${data.titre}</strong></h3>
                                <p><strong>Identifiant:</strong> ${data.identifiant}</p>
                                <p><strong>URL:</strong> <a href="${data.url}" target="_blank">${data.url}</a></p>
                                <p><strong>Date de publication:</strong> ${data.date}</p>
                                <p><strong>Contenu:</strong> ${data.content}</p>
                            </li>
                        </ul>
                        <hr>
                        <p><strong>Prompt généré :</strong></p>
                        <pre>${prompt}</pre>
                        <hr>
                        <p><strong>Rapport généré par Gemini :</strong></p>
                        <pre>${competitorName || 'Pas de nom généré par Gemini'}</pre>
                        <p><strong>Bonne lecture et à bientôt !</strong></p>
                    </body>
                </html>
            `;

            const mailOptions = {
                from: emailUser,
                to: recipientEmail,
                subject: 'Rapport de Veille Technologique et Prompt',
                html: emailContent
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error("Erreur lors de l'envoi de l'email :", error);
                } else {
                    console.log("Email envoyé avec succès :", info.response);
                }
            });
        }

        res.status(200).json({ success: true, message: "Les rapports ont été envoyés par email avec succès." });

    } catch (error) {
        console.error("Erreur :", error.message || error);
        res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération des données ou du traitement.",
            error: error.message || error
        });
    }
});



// Lancement du serveur
app.listen(PORT, () => {
    console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
