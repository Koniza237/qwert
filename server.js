const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const PDFDocument = require('pdfkit');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

console.log('Initialisation des routes API...');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function readJson(file) {
    try {
        const data = await fs.readFile(file, { encoding: 'utf8' });
        console.log(`Lecture réussie de ${file}`);
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`Fichier ${file} non trouvé, création d'un tableau vide`);
            await writeJson(file, []); // Initialize with empty array
            return [];
        }
        console.error(`Erreur lors de la lecture de ${file}:`, err.message);
        throw err;
    }
}

async function writeJson(file, data) {
    try {
        await fs.writeFile(file, JSON.stringify(data, null, 2));
        console.log(`Écriture réussie dans ${file}`);
    } catch (err) {
        console.error(`Erreur lors de l'écriture dans ${file}:`, err.message);
        throw err;
    }
}

const fileMap = {
    teachers: 'ress-ens.json',
    groups: 'ress-group.json',
    admins: 'admin.json',
    students: 'students.json',
    documents: 'documents.json',
    courses: 'mescours.json',
    grades: 'mesnotes.json',
    subjects: 'matieres.json',
    rooms: 'ress-salle.json',
    timetableDocuments: 'timetable-documents.json'
};

const emploitDir = path.join(__dirname, 'emploit');
fs.mkdir(emploitDir, { recursive: true }).catch(err => console.error('Erreur lors de la création du dossier emploit:', err));

const UPLOADS_DIR = path.join(__dirname, 'Uploads');
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(err => console.error('Erreur lors de la création du dossier uploads:', err.message));

const TIMETABLE_UPLOADS_DIR = path.join(UPLOADS_DIR, 'timetable-documents');
fs.mkdir(TIMETABLE_UPLOADS_DIR, { recursive: true }).catch(err => console.error('Erreur lors de la création du dossier timetable-documents:', err.message));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = req.path.includes('/timetable-documents/') ? TIMETABLE_UPLOADS_DIR : UPLOADS_DIR;
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.post('/api/verify-code', async (req, res) => {
    console.log('Requête POST /api/verify-code reçue:', req.body);
    const { code } = req.body;
    if (!code) {
        console.error('Code manquant dans la requête');
        return res.status(400).json({ error: 'Code requis' });
    }
    try {
        const codeData = await readJson('code.json');
        const submittedCode = parseInt(code);
        const isValidCode = codeData.some(item => item.code === submittedCode);
        if (isValidCode) {
            console.log('Code vérifié avec succès:', submittedCode);
            return res.status(200).json({ message: 'Code vérifié avec succès' });
        } else {
            console.warn('Code incorrect soumis:', submittedCode);
            return res.status(400).json({ error: 'Code invalide. Veuillez réessayer.' });
        }
    } catch (err) {
        console.error('Erreur lors de la vérification du code:', err.message);
        return res.status(500).json({ error: 'Erreur serveur lors de la vérification du code' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    console.log('Requête POST /api/reset-password reçue:', req.body);
    const { phoneNumber, email, password } = req.body;
    if (!phoneNumber || !email || !password) {
        console.error('Données manquantes dans la requête');
        return res.status(400).json({ error: 'Numéro de téléphone, email et mot de passe requis' });
    }
    try {
        const admins = await readJson(fileMap.admins);
        const adminIndex = admins.findIndex(a => a.email.toLowerCase() === email.toLowerCase());
        if (adminIndex === -1) {
            console.warn(`Échec de la réinitialisation du mot de passe pour ${email}: utilisateur non trouvé`);
            return res.status(400).json({ error: 'Email non trouvé. Veuillez vérifier votre email.' });
        }
        admins[adminIndex].password = password;
        admins[adminIndex].lastUpdated = new Date().toISOString();
        await writeJson(fileMap.admins, admins);
        console.log(`Mot de passe mis à jour pour ${email}`);
        return res.status(200).json({ message: 'Mot de passe mis à jour avec succès' });
    } catch (err) {
        console.error('Erreur lors de la réinitialisation du mot de passe:', err.message);
        return res.status(500).json({ error: 'Erreur serveur lors de la réinitialisation du mot de passe' });
    }
});

app.post('/api/ai', async (req, res) => {
    console.log('Requête POST /api/ai reçue', req.body);
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt requis' });
        }
        const result = await model.generateContent(prompt);
        const response = result.response.text();
        res.json({ response });
    } catch (err) {
        console.error('Erreur lors de l\'appel à l\'API Google GenAI:', err.message);
        res.status(500).json({ error: 'Erreur serveur lors de la génération de la réponse' });
    }
});

app.post('/api/login', async (req, res) => {
    console.log('Requête POST /api/login reçue:', req.body);
    const { email, password } = req.body;
    if (!email || !password) {
        console.error('Requête de connexion invalide: email ou mot de passe manquant');
        return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    try {
        const admins = await readJson(fileMap.admins);
        const admin = admins.find(a => a.email === email && a.password === password);
        if (!admin) {
            console.warn(`Échec de connexion: identifiants incorrects pour ${email}`);
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }
        console.log(`Connexion réussie pour ${email}`);
        res.json({ message: 'Connexion réussie', admin: { id: admin.id, email: admin.email, name: admin.name || 'Admin', role: 'Administrateur' } });
    } catch (err) {
        console.error('Erreur lors de la connexion:', err.message);
        res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
    }
});

app.post('/api/logout', async (req, res) => {
    console.log('Requête POST /api/logout reçue');
    try {
        const files = await fs.readdir(emploitDir);
        for (const file of files) {
            await fs.unlink(path.join(emploitDir, file));
        }
        console.log('Déconnexion réussie, dossier emploit vidé');
        res.json({ message: 'Déconnexion réussie' });
    } catch (err) {
        console.error('Erreur lors de la déconnexion:', err.message);
        res.status(500).json({ error: 'Erreur serveur lors de la déconnexion' });
    }
});

app.get('/api/resources/:type', async (req, res) => {
    console.log(`Requête GET /api/resources/${req.params.type} reçue`);
    const type = req.params.type;
    if (!fileMap[type]) return res.status(400).json({ error: 'Type invalide' });
    try {
        const data = await readJson(fileMap[type]);
        res.json(data);
    } catch (err) {
        console.error(`Erreur lors de la lecture de ${fileMap[type]}:`, err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/resources/:type', async (req, res) => {
    console.log(`Requête POST /api/resources/${req.params.type} reçue`, req.body);
    const type = req.params.type;
    if (!fileMap[type]) return res.status(400).json({ error: 'Type invalide' });
    try {
        const data = await readJson(fileMap[type]);
        const newResource = { id: data.length ? Math.max(...data.map(r => r.id)) + 1 : 1, ...req.body };
        data.push(newResource);
        await writeJson(fileMap[type], data);
        res.json(newResource);
    } catch (err) {
        console.error(`Erreur lors de l'écriture dans ${fileMap[type]}:`, err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.put('/api/resources/:type/:id', async (req, res) => {
    console.log(`Requête PUT /api/resources/${req.params.type}/${req.params.id} reçue`, req.body);
    const { type, id } = req.params;
    if (!fileMap[type]) return res.status(400).json({ error: 'Type invalide' });
    try {
        const data = await readJson(fileMap[type]);
        const index = data.findIndex(r => r.id === parseInt(id));
        if (index === -1) return res.status(404).json({ error: 'Ressource non trouvée' });
        data[index] = { ...data[index], ...req.body };
        await writeJson(fileMap[type], data);
        res.json(data[index]);
    } catch (err) {
        console.error(`Erreur lors de la mise à jour de ${fileMap[type]}:`, err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/resources/:type/:id', async (req, res) => {
    console.log(`Requête DELETE /api/resources/${req.params.type}/${req.params.id} reçue`);
    const { type, id } = req.params;
    if (!fileMap[type]) return res.status(400).json({ error: 'Type invalide' });
    try {
        let data = await readJson(fileMap[type]);
        const index = data.findIndex(r => r.id === parseInt(id));
        if (index === -1) return res.status(404).json({ error: 'Ressource non trouvée' });
        data = data.filter(r => r.id !== parseInt(id));
        await writeJson(fileMap[type], data);
        res.json({ message: 'Ressource supprimée' });
    } catch (err) {
        console.error(`Erreur lors de la suppression dans ${fileMap[type]}:`, err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/users/:type', async (req, res) => {
    console.log(`Requête GET /api/users/${req.params.type} reçue`);
    const type = req.params.type;
    if (!fileMap[type]) return res.status(400).json({ error: 'Type invalide' });
    try {
        const data = await readJson(fileMap[type]);
        res.json(data);
    } catch (err) {
        console.error(`Erreur lors de la lecture de ${fileMap[type]}:`, err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/users/:type', async (req, res) => {
    console.log(`Requête POST /api/users/${req.params.type} reçue`, req.body);
    const type = req.params.type;
    if (!fileMap[type]) return res.status(400).json({ error: 'Type invalide' });
    try {
        const data = await readJson(fileMap[type]);
        if (type === 'students') {
            if (!req.body.name || !req.body.password || !req.body.group) {
                return res.status(400).json({ error: 'Nom, mot de passe et groupe requis pour les étudiants' });
            }
            if (typeof req.body.name !== 'string') {
                return res.status(400).json({ error: 'Le nom doit être une chaîne de caractères' });
            }
            if (data.some(u => u.name && typeof u.name === 'string' && u.name.toLowerCase() === req.body.name.toLowerCase())) {
                return res.status(400).json({ error: 'Un étudiant avec ce nom existe déjà' });
            }
            const groups = await readJson(fileMap.groups);
            const groupExists = groups.find(g => g.name === req.body.group);
            if (!groupExists) {
                return res.status(400).json({ error: 'Nom de groupe invalide' });
            }
            const newGroups = groups.map(g => 
                g.name === req.body.group ? { ...g, studentCount: (g.studentCount || 0) + 1, lastUpdated: new Date().toISOString() } : g
            );
            await writeJson(fileMap.groups, newGroups);
        } else if (type === 'teachers') {
            if (!req.body.email || !req.body.password || !req.body.subjects) {
                return res.status(400).json({ error: 'Email, mot de passe et matières requis pour les enseignants' });
            }
            if (!Array.isArray(req.body.subjects)) {
                console.warn(`Requête invalide: subjects n'est pas un tableau: ${JSON.stringify(req.body.subjects)}`);
                return res.status(400).json({ error: 'La propriété subjects doit être un tableau' });
            }
            const subjects = await readJson(fileMap.subjects);
            const validSubjects = req.body.subjects.filter(subject => subjects.some(s => s.name === subject));
            if (!validSubjects.length) {
                return res.status(400).json({ error: 'Aucune matière valide spécifiée' });
            }
            if (data.some(u => u.email && typeof u.email === 'string' && u.email.toLowerCase() === req.body.email?.toLowerCase())) {
                return res.status(400).json({ error: 'Un utilisateur avec cet email existe déjà' });
            }
            const newUser = { 
                id: data.length ? Math.max(...data.map(u => u.id || 0)) + 1 : 1, 
                ...req.body,
                subjects: validSubjects,
                lastUpdated: new Date().toISOString()
            };
            data.push(newUser);
            await writeJson(fileMap.teachers, data);
            res.json(newUser);
        } else {
            if (!req.body.email || !req.body.password) {
                return res.status(400).json({ error: 'Email et mot de passe requis pour les administrateurs' });
            }
            if (data.some(u => u.email && typeof u.email === 'string' && u.email.toLowerCase() === req.body.email?.toLowerCase())) {
                return res.status(400).json({ error: 'Un utilisateur avec cet email existe déjà' });
            }
            const newUser = { 
                id: data.length ? Math.max(...data.map(u => u.id || 0)) + 1 : 1, 
                ...req.body,
                lastUpdated: new Date().toISOString()
            };
            data.push(newUser);
            await writeJson(fileMap[type], data);
            res.json(newUser);
        }
    } catch (err) {
        console.error(`Erreur lors de l'écriture dans ${fileMap[type]}:`, err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.put('/api/users/:type/:id', async (req, res) => {
    console.log(`Requête PUT /api/users/${req.params.type}/${req.params.id} reçue`, req.body);
    const { type, id } = req.params;
    try {
        if (!fileMap[type]) return res.status(400).json({ error: 'Type invalide' });
        const data = await readJson(fileMap[type]);
        const index = data.findIndex(u => u.id === parseInt(id));
        if (index === -1) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        if (type === 'students') {
            if (req.body.name && typeof req.body.name !== 'string') {
                return res.status(400).json({ error: 'Le nom doit être une chaîne de caractères' });
            }
            if (req.body.name && data.some(u => u.id !== parseInt(id) && u.name && typeof u.name === 'string' && u.name.toLowerCase() === req.body.name.toLowerCase())) {
                return res.status(400).json({ error: 'Un étudiant avec ce nom existe déjà' });
            }
            if (req.body.group) {
                const groups = await readJson(fileMap.groups);
                const groupExists = groups.find(g => g.name === req.body.group);
                if (!groupExists) {
                    return res.status(400).json({ error: 'Nom de groupe invalide' });
                }
                const oldGroup = data[index].group;
                if (oldGroup && oldGroup !== req.body.group) {
                    const newGroups = groups.map(g => {
                        if (g.name === oldGroup) {
                            return { ...g, studentCount: Math.max((g.studentCount || 0) - 1, 0), lastUpdated: new Date().toISOString() };
                        }
                        if (g.name === req.body.group) {
                            return { ...g, studentCount: (g.studentCount || 0) + 1, lastUpdated: new Date().toISOString() };
                        }
                        return g;
                    });
                    await writeJson(fileMap.groups, newGroups);
                }
            }
        } else if (type === 'teachers' && req.body.subjects) {
            if (!Array.isArray(req.body.subjects)) {
                console.warn(`Requête invalide: subjects n'est pas un tableau: ${JSON.stringify(req.body.subjects)}`);
                return res.status(400).json({ error: 'La propriété subjects doit être un tableau' });
            }
            const subjects = await readJson(fileMap.subjects);
            const validSubjects = req.body.subjects.filter(subject => subjects.some(s => s.name === subject));
            if (!validSubjects.length) {
                return res.status(400).json({ error: 'Aucune matière valide spécifiée' });
            }
            req.body.subjects = validSubjects;
        }
        if (req.body.email && data.some(u => u.id !== parseInt(id) && u.email && typeof u.email === 'string' && u.email.toLowerCase() === req.body.email.toLowerCase())) {
            return res.status(400).json({ error: 'Un utilisateur avec cet email existe déjà' });
        }
        data[index] = { ...data[index], ...req.body, lastUpdated: new Date().toISOString() };
        await writeJson(fileMap[type], data);
        res.json(data[index]);
    } catch (err) {
        console.error(`Erreur lors de la mise à jour de ${fileMap[type]}:`, err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/users/:type/:id', async (req, res) => {
    console.log(`Requête DELETE /api/users/${req.params.type}/${req.params.id} reçue`);
    const { type, id } = req.params;
    try {
        if (!fileMap[type]) return res.status(400).json({ error: 'Type invalide' });
        const data = await readJson(fileMap[type]);
        const index = data.findIndex(u => u.id === parseInt(id));
        if (index === -1) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        if (type === 'students' && data[index].group) {
            const groups = await readJson(fileMap.groups);
            const newGroups = groups.map(g => 
                g.name === data[index].group ? { ...g, studentCount: Math.max((g.studentCount || 0) - 1, 0), lastUpdated: new Date().toISOString() } : g
            );
            await writeJson(fileMap.groups, newGroups);
        }
        const updatedData = data.filter((_, i) => i !== index);
        await writeJson(fileMap[type], updatedData);
        res.json({ message: 'Utilisateur supprimé' });
    } catch (err) {
        console.error(`Erreur lors de la suppression dans ${fileMap[type]}:`, err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/constraints', async (req, res) => {
    console.log('Requête GET /api/constraints reçue');
    try {
        const data = await readJson('constraints.json');
        res.json(data);
    } catch (err) {
        console.error('Erreur lors de la lecture de constraints.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/constraints', async (req, res) => {
    console.log('Requête POST /api/constraints reçue', req.body);
    try {
        const data = await readJson('constraints.json');
        const newConstraint = { id: data.length ? Math.max(...data.map(c => c.id)) + 1 : 1, ...req.body };
        data.push(newConstraint);
        await writeJson('constraints.json', data);
        res.json(newConstraint);
    } catch (err) {
        console.error('Erreur lors de l\'écriture dans constraints.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.put('/api/constraints/:id', async (req, res) => {
    console.log(`Requête PUT /api/constraints/${req.params.id} reçue`, req.body);
    const { id } = req.params;
    try {
        const data = await readJson('constraints.json');
        const index = data.findIndex(c => c.id === parseInt(id));
        if (index === -1) return res.status(404).json({ error: 'Contrainte non trouvée' });
        data[index] = { ...data[index], ...req.body };
        await writeJson('constraints.json', data);
        res.json(data[index]);
    } catch (err) {
        console.error('Erreur lors de la modification de constraints.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/constraints/:id', async (req, res) => {
    console.log(`Requête DELETE /api/constraints/${req.params.id} reçue`);
    const id = req.params.id;
    try {
        let data = await readJson('constraints.json');
        const index = data.findIndex(c => c.id === parseInt(id));
        if (index === -1) return res.status(404).json({ error: 'Contrainte non trouvée' });
        data = data.filter(c => c.id !== parseInt(id));
        await writeJson('constraints.json', data);
        res.json({ message: 'Contrainte supprimée' });
    } catch (err) {
        console.error('Erreur lors de la suppression dans constraints.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/subjects', async (req, res) => {
    console.log('Requête GET /api/subjects reçue');
    try {
        const data = await readJson(fileMap.subjects);
        res.json(data);
    } catch (err) {
        console.error('Erreur lors de la lecture de matieres.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/subjects', async (req, res) => {
    console.log('Requête POST /api/subjects reçue', req.body);
    try {
        const data = await readJson(fileMap.subjects);
        const newSubject = { id: data.length ? Math.max(...data.map(s => s.id)) + 1 : 1, ...req.body };
        data.push(newSubject);
        await writeJson(fileMap.subjects, data);
        let groupSubjectVolumes = await readJson('group-subject-volumes.json').catch(() => ({}));
        const groups = await readJson(fileMap.groups);
        for (const group of groups) {
            if (!groupSubjectVolumes[group.name]) {
                groupSubjectVolumes[group.name] = {};
            }
            groupSubjectVolumes[group.name][newSubject.name] = parseInt(newSubject.hourlyVolume) || 0;
        }
        await writeJson('group-subject-volumes.json', groupSubjectVolumes);
        res.json(newSubject);
    } catch (err) {
        console.error('Erreur lors de l\'écriture dans matieres.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.put('/api/subjects/:id', async (req, res) => {
    console.log(`Requête PUT /api/subjects/${req.params.id} reçue`, req.body);
    const { id } = req.params;
    try {
        const data = await readJson(fileMap.subjects);
        const index = data.findIndex(s => s.id === parseInt(id));
        if (index === -1) return res.status(404).json({ error: 'Matière non trouvée' });
        const oldSubjectName = data[index].name;
        data[index] = { ...data[index], ...req.body };
        await writeJson(fileMap.subjects, data);
        let groupSubjectVolumes = await readJson('group-subject-volumes.json').catch(() => ({}));
        const groups = await readJson(fileMap.groups);
        for (const group of groups) {
            if (!groupSubjectVolumes[group.name]) {
                groupSubjectVolumes[group.name] = {};
            }
            if (req.body.name && req.body.name !== oldSubjectName) {
                groupSubjectVolumes[group.name][req.body.name] = parseInt(req.body.hourlyVolume) || 0;
                delete groupSubjectVolumes[group.name][oldSubjectName];
            } else if (req.body.hourlyVolume) {
                groupSubjectVolumes[group.name][data[index].name] = parseInt(req.body.hourlyVolume) || 0;
            }
        }
        await writeJson('group-subject-volumes.json', groupSubjectVolumes);
        res.json(data[index]);
    } catch (err) {
        console.error('Erreur lors de la modification de matieres.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/subjects/:id', async (req, res) => {
    console.log(`Requête DELETE /api/subjects/${req.params.id} reçue`);
    const { id } = req.params;
    try {
        let data = await readJson(fileMap.subjects);
        const index = data.findIndex(s => s.id === parseInt(id));
        if (index === -1) return res.status(404).json({ error: 'Matière non trouvée' });
        const subjectName = data[index].name;
        data = data.filter(s => s.id !== parseInt(id));
        await writeJson(fileMap.subjects, data);
        let groupSubjectVolumes = await readJson('group-subject-volumes.json').catch(() => ({}));
        const groups = await readJson(fileMap.groups);
        for (const group of groups) {
            if (groupSubjectVolumes[group.name]) {
                delete groupSubjectVolumes[group.name][subjectName];
            }
        }
        await writeJson('group-subject-volumes.json', groupSubjectVolumes);
        res.json({ message: 'Matière supprimée' });
    } catch (err) {
        console.error('Erreur lors de la suppression dans matieres.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/group-subject-volumes', async (req, res) => {
    console.log('Requête GET /api/group-subject-volumes reçue');
    try {
        const volumes = await readJson('group-subject-volumes.json').catch(() => ({}));
        res.json(volumes);
    } catch (err) {
        console.error('Erreur lors de la lecture de group-subject-volumes.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur lors de la récupération des volumes restants' });
    }
});

app.get('/api/documents', async (req, res) => {
    console.log('Requête GET /api/documents reçue');
    try {
        const data = await readJson(fileMap.documents);
        res.json(data);
    } catch (err) {
        console.error('Erreur lors de la lecture de documents.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/documents', upload.single('file'), async (req, res) => {
    console.log('Requête POST /api/documents reçue', req.body);
    try {
        const { title, content, category, uploadedBy } = req.body;
        if (!title || !content || !req.file) {
            return res.status(400).json({ error: 'Titre, contenu et fichier requis' });
        }
        const data = await readJson(fileMap.documents);
        const newDocument = {
            id: data.length ? Math.max(...data.map(d => d.id)) + 1 : 1,
            title,
            content,
            category,
            fileName: req.file.filename,
            uploadedBy: uploadedBy || 'Admin'
        };
        data.push(newDocument);
        await writeJson(fileMap.documents, data);
        res.json(newDocument);
    } catch (err) {
        console.error('Erreur lors de l\'enregistrement du document:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/documents/:id/download', async (req, res) => {
    console.log(`Requête GET /api/documents/${req.params.id}/download reçue`);
    const { id } = req.params;
    try {
        const data = await readJson(fileMap.documents);
        const document = data.find(d => d.id === parseInt(id));
        if (!document) {
            return res.status(404).json({ error: 'Document non trouvé' });
        }
        const filePath = path.join(UPLOADS_DIR, document.fileName);
        res.download(filePath, document.fileName, err => {
            if (err) {
                console.error('Erreur lors du téléchargement du document:', err.message);
                res.status(500).json({ error: 'Erreur serveur lors du téléchargement' });
            }
        });
    } catch (err) {
        console.error('Erreur lors de la lecture de documents.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/documents/:id', async (req, res) => {
    console.log(`Requête DELETE /api/documents/${req.params.id} reçue`);
    const { id } = req.params;
    try {
        let data = await readJson(fileMap.documents);
        const document = data.find(d => d.id === parseInt(id));
        if (!document) {
            return res.status(404).json({ error: 'Document non trouvé' });
        }
        const filePath = path.join(UPLOADS_DIR, document.fileName);
        try {
            await fs.access(filePath);
            await fs.unlink(filePath);
            console.log(`Fichier ${filePath} supprimé avec succès.`);
        } catch (err) {
            console.warn(`Fichier ${filePath} non trouvé ou déjà supprimé: ${err.message}`);
        }
        data = data.filter(d => d.id !== parseInt(id));
        await writeJson(fileMap.documents, data);
        res.json({ message: 'Document supprimé' });
    } catch (err) {
        console.error('Erreur lors de la suppression du document:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/timetable-documents/upload', upload.single('file'), async (req, res) => {
    console.log('Requête POST /api/timetable-documents/upload reçue', req.body);
    try {
        const { uploadedBy } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: 'Fichier requis' });
        }
        const data = await readJson(fileMap.timetableDocuments);
        const newDocument = {
            id: data.length ? Math.max(...data.map(d => d.id)) + 1 : 1,
            title: req.file.originalname,
            fileName: req.file.filename,
            uploadedBy: uploadedBy || 'Enseignant',
            uploadDate: new Date().toISOString()
        };
        data.push(newDocument);
        await writeJson(fileMap.timetableDocuments, data);
        res.json({ document: newDocument });
    } catch (err) {
        console.error('Erreur lors de l\'enregistrement du document d\'emploi du temps:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/timetable-documents', async (req, res) => {
    console.log('Requête GET /api/timetable-documents reçue');
    try {
        const data = await readJson(fileMap.timetableDocuments);
        res.json({ documents: data });
    } catch (err) {
        console.error('Erreur lors de la lecture de timetable-documents.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/timetable-documents/:id', async (req, res) => {
    console.log(`Requête DELETE /api/timetable-documents/${req.params.id} reçue`);
    const { id } = req.params;
    try {
        let data = await readJson(fileMap.timetableDocuments);
        const document = data.find(d => d.id === parseInt(id));
        if (!document) {
            return res.status(404).json({ error: 'Document non trouvé' });
        }
        const filePath = path.join(TIMETABLE_UPLOADS_DIR, document.fileName);
        try {
            await fs.access(filePath);
            await fs.unlink(filePath);
            console.log(`Fichier ${filePath} supprimé avec succès.`);
        } catch (err) {
            console.warn(`Fichier ${filePath} non trouvé ou déjà supprimé: ${err.message}`);
        }
        data = data.filter(d => d.id !== parseInt(id));
        await writeJson(fileMap.timetableDocuments, data);
        res.json({ message: 'Document supprimé' });
    } catch (err) {
        console.error('Erreur lors de la suppression du document d\'emploi du temps:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/courses', async (req, res) => {
    console.log('Requête GET /api/courses reçue');
    try {
        const courses = await readJson(fileMap.courses);
        res.json(courses);
    } catch (err) {
        console.error('Erreur lors de la lecture de mescours.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/courses/upload', upload.single('file'), async (req, res) => {
    console.log('Requête POST /api/courses/upload reçue', req.body);
    try {
        const { uploadedBy } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: 'Fichier requis' });
        }
        const courses = await readJson(fileMap.courses);
        const newCourse = {
            id: courses.length ? Math.max(...courses.map(c => c.id)) + 1 : 1,
            name: req.file.originalname,
            uploadedBy: uploadedBy || 'Étudiant'
        };
        courses.push(newCourse);
        await writeJson(fileMap.courses, courses);
        res.json(newCourse);
    } catch (err) {
        console.error('Erreur lors de l\'enregistrement du cours:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/courses/:id', async (req, res) => {
    console.log(`Requête DELETE /api/courses/${req.params.id} reçue`);
    const { id } = req.params;
    try {
        let courses = await readJson(fileMap.courses);
        const course = courses.find(c => c.id === parseInt(id));
        if (!course) {
            return res.status(404).json({ error: 'Cours non trouvé' });
        }
        const coursePath = path.join(UPLOADS_DIR, course.name);
        await fs.unlink(coursePath).catch(err => {
            console.error('Erreur lors de la suppression du cours:', err.message);
        });
        courses = courses.filter(c => c.id !== parseInt(id));
        await writeJson(fileMap.courses, courses);
        res.json({ message: 'Cours supprimé' });
    } catch (err) {
        console.error('Erreur lors de la suppression du cours:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/grades', async (req, res) => {
    console.log('Requête GET /api/grades reçue');
    try {
        const grades = await readJson(fileMap.grades);
        res.json(grades);
    } catch (err) {
        console.error('Erreur lors de la lecture de mesnotes.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/grades', async (req, res) => {
    console.log('Requête POST /api/grades reçue', req.body);
    try {
        const { subject, grade, coefficient, addedBy } = req.body;
        if (!subject || !grade || !coefficient) {
            return res.status(400).json({ error: 'Matière, note et coefficient requis' });
        }
        const grades = await readJson(fileMap.grades);
        const newGrade = {
            id: grades.length ? Math.max(...grades.map(g => g.id)) + 1 : 1,
            subject,
            grade,
            coefficient,
            addedBy: addedBy || 'Étudiant'
        };
        grades.push(newGrade);
        await writeJson(fileMap.grades, grades);
        res.json(newGrade);
    } catch (err) {
        console.error('Erreur lors de l\'enregistrement de la note:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/grades/upload', upload.single('file'), async (req, res) => {
    console.log('Requête POST /api/grades/upload reçue', req.body);
    try {
        const { uploadedBy } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: 'Fichier requis' });
        }
        const grades = await readJson(fileMap.grades);
        const newGrade = {
            id: grades.length ? Math.max(...grades.map(g => g.id)) + 1 : 1,
            subject: req.file.originalname,
            grade: null,
            coefficient: null,
            addedBy: uploadedBy || 'Étudiant'
        };
        grades.push(newGrade);
        await writeJson(fileMap.grades, grades);
        res.json(newGrade);
    } catch (err) {
        console.error('Erreur lors de l\'enregistrement du fichier de notes:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/grades/:id', async (req, res) => {
    console.log(`Requête DELETE /api/grades/${req.params.id} reçue`);
    const { id } = req.params;
    try {
        let grades = await readJson(fileMap.grades);
        const grade = grades.find(g => g.id === parseInt(id));
        if (!grade) {
            return res.status(404).json({ error: 'Note non trouvée' });
        }
        if (grade.subject) {
            const gradePath = path.join(UPLOADS_DIR, grade.subject);
            await fs.unlink(gradePath).catch(err => {
                console.error('Erreur lors de la suppression du fichier:', err.message);
            });
        }
        grades = grades.filter(g => g.id !== parseInt(id));
        await writeJson(fileMap.grades, grades);
        res.json({ message: 'Note supprimée' });
    } catch (err) {
        console.error('Erreur lors de la suppression de la note:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/messages', async (req, res) => {
    console.log('Requête GET /api/messages reçue');
    try {
        const messagesEtu = await readJson('messages-etu.json');
        const formattedMessages = messagesEtu.map(msg => ({
            content: msg.content || msg,
            type: 'students',
            timestamp: msg.timestamp || new Date().toISOString()
        }));
        console.log('Messages envoyés au client:', formattedMessages);
        res.json(formattedMessages);
    } catch (err) {
        console.error('Erreur lors de la lecture des messages:', err.message);
        res.status(500).json({ error: 'Erreur serveur lors du chargement des messages' });
    }
});

app.post('/api/messages-etu', async (req, res) => {
    console.log('Requête POST /api/messages-etu reçue:', req.body);
    try {
        const { content } = req.body;
        const messages = await readJson('messages-etu.json');
        messages.push({ content, timestamp: new Date().toISOString() });
        await writeJson('messages-etu.json', messages);
        console.log('Nouveau message étudiant enregistré:', content);
        res.json({ content, type: 'students', timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('Erreur lors de l\'écriture dans messages-etu.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur lors de l\'envoi du message' });
    }
});

app.post('/api/messages-ens', async (req, res) => {
    console.log('Requête POST /api/messages-ens reçue:', req.body);
    try {
        const { content } = req.body;
        const messages = await readJson('messages-ens.json');
        messages.push({ content, timestamp: new Date().toISOString() });
        await writeJson('messages-ens.json', messages);
        console.log('Nouveau message enseignant enregistré:', content);
        res.json({ content, type: 'teachers', timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('Erreur lors de l\'écriture dans messages-ens.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur lors de l\'envoi du message' });
    }
});

app.get('/api/messages-ens', async (req, res) => {
    console.log('Requête GET /api/messages-ens reçue');
    try {
        const messages = await readJson('messages-ens.json');
        const formattedMessages = messages.map((msg, index) => ({
            ...msg,
            id: index,
            timestamp: msg.timestamp || new Date().toISOString(),
            type: 'teachers'
        }));
        res.json(formattedMessages);
    } catch (err) {
        console.error('Erreur lors de la lecture de messages-ens.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur lors du chargement des messages' });
    }
});

app.delete('/api/messages/:type/:index', async (req, res) => {
    console.log(`Requête DELETE /api/messages/${req.params.type}/${req.params.index} reçue`);
    const { type, index } = req.params;
    const file = type === 'students' ? 'messages-etu.json' : 'messages-ens.json';
    if (type !== 'students' && type !== 'teachers') {
        return res.status(400).json({ error: 'Type invalide' });
    }
    try {
        const messages = await readJson(file);
        console.log(`Messages dans ${file}:`, messages); // Debug log
        const idx = parseInt(index);
        console.log(`Index demandé: ${idx}, Longueur des messages: ${messages.length}`); // Debug log
        if (idx < 0 || idx >= messages.length) {
            return res.status(404).json({ error: 'Message non trouvé' });
        }
        messages.splice(idx, 1);
        await writeJson(file, messages);
        console.log(`Message à l'index ${idx} supprimé dans ${file}`);
        res.json({ message: 'Message supprimé' });
    } catch (err) {
        console.error(`Erreur lors de la suppression de ${file}:`, err.message);
        res.status(500).json({ error: 'Erreur serveur lors de la suppression du message' });
    }
});

app.get('/api/visualisation', async (req, res) => {
    console.log('Requête GET /api/visualisation reçue');
    try {
        const files = await fs.readdir(emploitDir);
        const visualisationData = [];
        for (const file of files) {
            if (file.endsWith('.json')) {
                const data = await readJson(path.join(emploitDir, file));
                visualisationData.push(data);
            }
        }
        res.json(visualisationData);
    } catch (err) {
        console.error('Erreur lors de la lecture du dossier emploit:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/visualisation', async (req, res) => {
    console.log('Requête DELETE /api/visualisation reçue');
    try {
        const files = await fs.readdir(emploitDir);
        for (const file of files) {
            await fs.unlink(path.join(emploitDir, file));
        }
        res.json({ message: 'Dossier emploit vidé' });
    } catch (err) {
        console.error('Erreur lors de la suppression du dossier emploit:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/history', async (req, res) => {
    console.log('Requête GET /api/history reçue');
    try {
        const files = await fs.readdir(emploitDir);
        const historyData = files
            .filter(file => file.endsWith('.json'))
            .map(file => {
                const match = file.match(/(timetable|teacher-timetable)_(\d{4}-\d{2}-\d{2})_(.+)\.json/);
                return {
                    name: file,
                    type: match && match[1] === 'timetable' ? 'group' : 'teacher',
                    entity: match ? match[3] : 'Inconnu'
                };
            });
        res.json(historyData);
    } catch (err) {
        console.error('Erreur lors de la lecture du dossier emploit:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/timetable/:fileName', async (req, res) => {
    console.log(`Requête GET /api/timetable/${req.params.fileName} reçue`);
    const { fileName } = req.params;
    try {
        const data = await readJson(path.join(emploitDir, fileName));
        res.json(data);
    } catch (err) {
        console.error(`Erreur lors de la lecture du fichier ${fileName} :`, err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/teacher-timetable/:teacherName', async (req, res) => {
    console.log(`Requête GET /api/teacher-timetable/${req.params.teacherName} reçue`);
    const { teacherName } = req.params;
    try {
        const files = await fs.readdir(emploitDir);
        const teacherFile = files.find(file => 
            file.startsWith(`teacher-timetable_`) && file.includes(teacherName)
        );
        if (!teacherFile) {
            return res.status(404).json({ error: 'Emploi du temps de l\'enseignant non trouvé' });
        }
        const data = await readJson(path.join(emploitDir, teacherFile));
        res.json(data);
    } catch (err) {
        console.error(`Erreur lors de la lecture de l\'emploi du temps de ${teacherName}:`, err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/export-timetable', async (req, res) => {
    console.log('Requête POST /api/export-timetable reçue', req.body);
    const { type, timetables, group, teacher, date, days } = req.body;
    if (!timetables || (!group && !teacher) || !date) {
        return res.status(400).json({ error: 'Données, groupe ou enseignant, et date manquants' });
    }
    try {
        let fileName;
        if (type === 'group') {
            fileName = `timetable_${date}_${group}.json`;
            const timetableData = { group, date, timetable: timetables, days };
            await writeJson(path.join(emploitDir, fileName), timetableData);
        } else if (type === 'teacher') {
            fileName = `teacher-timetable_${date}_${teacher}.json`;
            const timetableData = { teacher, courses: timetables };
            await writeJson(path.join(emploitDir, fileName), timetableData);
        }
        res.json({ message: 'Emploi du temps exporté avec succès' });
    } catch (err) {
        console.error('Erreur lors de l\'exportation:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/generate-timetable', async (req, res) => {
    console.log('Requête POST /api/generate-timetable reçue', req.body);
    const { date } = req.body;
    if (!date) {
        return res.status(400).json({ error: 'Date requise' });
    }

    try {
        const teachers = await readJson(fileMap.teachers);
        const groups = await readJson(fileMap.groups);
        const constraints = await readJson('constraints.json');
        const subjects = await readJson(fileMap.subjects);
        const rooms = await readJson(fileMap.rooms);

        if (!teachers.length || !groups.length || !subjects.length || !rooms.length) {
            return res.status(400).json({ error: 'Données essentielles manquantes pour générer l\'emploi du temps' });
        }

        let groupSubjectVolumes = {};
        try {
            groupSubjectVolumes = await readJson('group-subject-volumes.json');
            if (!Object.keys(groupSubjectVolumes).length) {
                console.log('group-subject-volumes.json vide, initialisation...');
                for (const group of groups) {
                    groupSubjectVolumes[group.name] = {};
                    for (const subject of subjects) {
                        groupSubjectVolumes[group.name][subject.name] = parseInt(subject.hourlyVolume) || 0;
                    }
                }
                await writeJson('group-subject-volumes.json', groupSubjectVolumes);
            }
        } catch (err) {
            console.log('group-subject-volumes.json non trouvé ou invalide, création...');
            for (const group of groups) {
                groupSubjectVolumes[group.name] = {};
                for (const subject of subjects) {
                    groupSubjectVolumes[group.name][subject.name] = parseInt(subject.hourlyVolume) || 0;
                }
            }
            await writeJson('group-subject-volumes.json', groupSubjectVolumes);
        }

        const subjectNames = subjects.map(s => s.name);
        for (const teacher of teachers) {
            if (!Array.isArray(teacher.subjects)) {
                console.warn(`Enseignant ${teacher.name} a une propriété subjects non valide: ${JSON.stringify(teacher.subjects)}. Conversion en tableau.`);
                teacher.subjects = teacher.subjects ? [teacher.subjects].filter(Boolean) : [];
            }
            const invalidSubjects = teacher.subjects.filter(s => !subjectNames.includes(s));
            if (invalidSubjects.length) {
                console.warn(`Enseignant ${teacher.name} référence des matières invalides: ${invalidSubjects.join(', ')}`);
                teacher.subjects = teacher.subjects.filter(s => subjectNames.includes(s));
            }
        }

        const timeSlots = ['08:00-10:00', '10:00-12:00', '13:00-15:00', '15:00-17:00'];
        const selectedDate = new Date(date);
        if (isNaN(selectedDate.getTime())) {
            return res.status(400).json({ error: 'Date invalide' });
        }
        const dayNames = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
        const days = [];
        let currentDate = new Date(selectedDate);
        let daysAdded = 0;

        while (daysAdded < 5) {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                const dayName = dayNames[dayOfWeek - 1];
                days.push({
                    name: dayName,
                    display: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${currentDate.getDate()}`
                });
                daysAdded++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        const result = {
            groups: [],
            teachers: []
        };
        const assignments = new Map();

        const isSlotAvailable = (teacherName, group, room, day, slot) => {
            const slotKey = `${day}_${slot}`;
            const slotAssignments = assignments.get(slotKey) || [];
            return !slotAssignments.some(a => 
                a.teacher === teacherName || a.group === group || a.room === room
            );
        };

        const assignSlot = (teacherName, group, subject, room, day, slot) => {
            const slotKey = `${day}_${slot}`;
            const slotAssignments = assignments.get(slotKey) || [];
            slotAssignments.push({ teacher: teacherName, group, subject, room });
            assignments.set(slotKey, slotAssignments);
            if (groupSubjectVolumes[group][subject] > 0) {
                groupSubjectVolumes[group][subject] -= 2;
                if (groupSubjectVolumes[group][subject] < 0) groupSubjectVolumes[group][subject] = 0;
            }
        };

        const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];

        const teacherTimetables = teachers.reduce((acc, teacher) => {
            acc[teacher.name] = {
                teacher: teacher.name,
                courses: []
            };
            return acc;
        }, {});

        for (const group of groups) {
            const timetable = timeSlots.map(slot => ({
                time: slot,
                ...days.reduce((acc, day) => ({ ...acc, [day.name]: '' }), {})
            }));

            for (const day of days) {
                for (const slot of timeSlots) {
                    const slotIndex = timeSlots.indexOf(slot);
                    const availableTeachers = teachers.filter(t => 
                        isSlotAvailable(t.name, group.name, null, day.name, slot)
                    );
                    const availableRooms = rooms.filter(r => 
                        isSlotAvailable(null, group.name, r.name, day.name, slot)
                    );

                    if (availableTeachers.length && availableRooms.length) {
                        const validAssignments = [];
                        for (const teacher of availableTeachers) {
                            const teachableSubjects = teacher.subjects.filter(s => 
                                groupSubjectVolumes[group.name][s] > 0
                            );
                            for (const subject of teachableSubjects) {
                                validAssignments.push({ teacher, subject });
                            }
                        }

                        if (validAssignments.length) {
                            const assignment = getRandomElement(validAssignments);
                            const teacher = assignment.teacher;
                            const subject = assignment.subject;
                            const room = getRandomElement(availableRooms);

                            timetable[slotIndex][day.name] = `${subject} (${teacher.name}, ${group.name}, ${room.name})`;
                            assignSlot(teacher.name, group.name, subject, room.name, day.name, slot);

                            teacherTimetables[teacher.name].courses.push({
                                day: day.name,
                                dayDisplay: day.display,
                                time: slot,
                                subject,
                                group: group.name,
                                room: room.name
                            });
                        } else {
                            console.warn(`Aucune combinaison enseignant/matière disponible pour ${group.name} le ${day.display} à ${slot}`);
                        }
                    } else {
                        console.warn(`Aucun enseignant ou salle disponible pour ${group.name} le ${day.display} à ${slot}`);
                    }
                }
            }

            for (const constraint of constraints) {
                if (constraint.type !== 'Indisponible' || !constraint.teacher) continue;
                const dayName = constraint.day?.toLowerCase();
                const slot = constraint.time;
                if (!days.some(d => d.name === dayName) || !timeSlots.includes(slot)) continue;

                const slotIndex = timeSlots.indexOf(slot);
                if (timetable[slotIndex][dayName]?.includes(constraint.teacher)) {
                    timetable[slotIndex][dayName] = 'Libre';
                    const slotKey = `${dayName}_${slot}`;
                    assignments.set(slotKey, []);

                    teacherTimetables[constraint.teacher].courses = teacherTimetables[constraint.teacher].courses.filter(
                        course => !(course.day === dayName && course.time === slot)
                    );
                }
            }

            const fileName = `timetable_${date}_${group.name}.json`;
            await writeJson(path.join(emploitDir, fileName), { group: group.name, date, timetable, days });
            result.groups.push({ group: group.name, date, timetable, days });
        }

        for (const teacherName in teacherTimetables) {
            const fileName = `teacher-timetable_${date}_${teacherName}.json`;
            await writeJson(path.join(emploitDir, fileName), teacherTimetables[teacherName]);
            result.teachers.push(teacherTimetables[teacherName]);
        }

        await writeJson('group-subject-volumes.json', groupSubjectVolumes);
        res.json(result);
    } catch (err) {
        console.error('Erreur lors de la génération de l\'emploi du temps:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/export-pdf', async (req, res) => {
    console.log('Requête POST /api/export-pdf reçue', req.body);
    const { type, timetables, group, teacher, date, days } = req.body;

    try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const tempDir = path.join(__dirname, 'temp');
        await fs.mkdir(tempDir, { recursive: true }).catch(err => console.error('Erreur lors de la création du dossier temp:', err.message));

        if (type === 'teacher') {
            if (!timetables?.courses || !teacher || !date) {
                return res.status(400).json({ error: 'Données, enseignant ou date manquants' });
            }

            const pdfFilePath = path.join(tempDir, `teacher-timetable_${teacher}_${date}.pdf`);
            const writeStream = fsSync.createWriteStream(pdfFilePath);
            doc.pipe(writeStream);

            const subjects = await readJson(fileMap.subjects);
            const subjectCodeMap = subjects.reduce((map, subj) => {
                map[subj.name] = subj.code || subj.name;
                return map;
            }, {});

            const dayOrder = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
            const sortedCourses = timetables.courses.sort((a, b) => {
                const dayA = dayOrder.indexOf(a.day.toLowerCase());
                const dayB = dayOrder.indexOf(b.day.toLowerCase());
                if (dayA !== dayB) return dayA - dayB;
                return a.time.localeCompare(b.time);
            });

            doc.fontSize(16).text(`Emploi du Temps - Fareno University`, { align: 'center' });
            doc.fontSize(12).text(`Enseignant: ${teacher} | Semaine du ${date}`, { align: 'center' });
            doc.moveDown(2);

            const tableTop = doc.y;
            const colWidths = [90, 60, 90, 90, 90];
            const rowHeight = 40;
            const tableWidth = colWidths.reduce((sum, w) => sum + w, 0);
            const tableLeft = (doc.page.width - tableWidth) / 2;

            doc.fontSize(10).font('Helvetica-Bold');
            let x = tableLeft;
            ['Jour', 'Heure', 'Code', 'Groupe', 'Salle'].forEach((header, i) => {
                doc.rect(x, tableTop, colWidths[i], rowHeight).fill('#3b82f6');
                doc.fillColor('white').text(header, x + 5, tableTop + 15, { width: colWidths[i] - 10, align: 'center' });
                x += colWidths[i];
            });

            doc.fontSize(8).font('Helvetica').fillColor('black');
            let y = tableTop + rowHeight;
            sortedCourses.forEach(course => {
                x = tableLeft;
                const cells = [
                    course.dayDisplay || '-',
                    course.time || '-',
                    subjectCodeMap[course.subject] || course.subject || '-',
                    course.group || '-',
                    course.room || '-'
                ];
                cells.forEach((cell, i) => {
                    doc.rect(x, y, colWidths[i], rowHeight).stroke();
                    doc.text(cell, x + 5, y + 5, { width: colWidths[i] - 10, height: rowHeight - 10, align: 'center', lineBreak: true });
                    x += colWidths[i];
                });
                y += rowHeight;
            });

            doc.end();
            writeStream.on('finish', () => {
                res.download(pdfFilePath, `teacher-timetable_${teacher}_${date}.pdf`, err => {
                    if (err) {
                        console.error('Erreur lors du téléchargement du PDF:', err.message);
                        res.status(500).json({ error: 'Erreur serveur lors de la génération du PDF' });
                    }
                    fs.unlink(pdfFilePath).catch(err => console.error('Erreur lors de la suppression du PDF:', err.message));
                });
            });
            writeStream.on('error', err => {
                console.error('Erreur lors de l\'écriture du PDF:', err.message);
                res.status(500).json({ error: 'Erreur serveur lors de la génération du PDF' });
            });
        } else {
            if (!timetables || !group || !date || !days) {
                return res.status(400).json({ error: 'Données, groupe, date ou jours manquants' });
            }

            const pdfFilePath = path.join(tempDir, `timetable_${group}_${date}.pdf`);
            const writeStream = fsSync.createWriteStream(pdfFilePath);
            doc.pipe(writeStream);

            doc.fontSize(16).text(`Emploi du Temps - Fareno University`, { align: 'center' });
            doc.fontSize(12).text(`Groupe: ${group} | Semaine du ${date}`, { align: 'center' });
            doc.moveDown(2);

            const tableTop = doc.y;
            const colWidths = [60, ...days.map(() => 90)];
            const rowHeight = 40;
            const tableWidth = colWidths.reduce((sum, w) => sum + w, 0);
            const tableLeft = (doc.page.width - tableWidth) / 2;

            doc.fontSize(10).font('Helvetica-Bold');
            let x = tableLeft;
            ['Heure', ...days.map(d => d.display)].forEach((header, i) => {
                doc.rect(x, tableTop, colWidths[i], rowHeight).fill('#3b82f6');
                doc.fillColor('white').text(header, x + 5, tableTop + 15, { width: colWidths[i] - 10, align: 'center' });
                x += colWidths[i];
            });

            doc.fontSize(8).font('Helvetica').fillColor('black');
            let y = tableTop + rowHeight;
            timetables.forEach((t, index) => {
                x = tableLeft;
                const cells = [t.time || '-', ...days.map(day => t[day.name] || '-')];
                cells.forEach((cell, i) => {
                    doc.rect(x, y, colWidths[i], rowHeight).stroke();
                    doc.text(cell, x + 5, y + 5, { width: colWidths[i] - 10, height: rowHeight - 10, align: 'center', lineBreak: true });
                    x += colWidths[i];
                });
                y += rowHeight;

                if (t.time === '10:00-12:00') {
                    x = tableLeft;
                    const pauseCells = ['12:00-13:00', ...days.map(() => 'Pause')];
                    pauseCells.forEach((cell, i) => {
                        doc.rect(x, y, colWidths[i], rowHeight).fill('#e5e7eb');
                        doc.fillColor('black').text(cell, x + 5, y + 15, { width: colWidths[i] - 10, align: 'center' });
                        x += colWidths[i];
                    });
                    y += rowHeight;
                }
            });

            doc.end();
            writeStream.on('finish', () => {
                res.download(pdfFilePath, `timetable_${group}_${date}.pdf`, err => {
                    if (err) {
                        console.error('Erreur lors du téléchargement du PDF:', err.message);
                        res.status(500).json({ error: 'Erreur serveur lors de la génération du PDF' });
                    }
                    fs.unlink(pdfFilePath).catch(err => console.error('Erreur lors de la suppression du PDF:', err.message));
                });
            });
            writeStream.on('error', err => {
                console.error('Erreur lors de l\'écriture du PDF:', err.message);
                res.status(500).json({ error: 'Erreur serveur lors de la génération du PDF' });
            });
        }
    } catch (err) {
        console.error('Erreur lors de l\'exportation en PDF:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.use(express.static(__dirname));
app.use(express.static('public'));
console.log('Routes statiques configurées pour:', __dirname);

app.get('/aideetu.html', (req, res) => {
    console.log('Requête GET /aideetu.html reçue');
    const filePath = path.join(__dirname, 'aideetu.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Erreur lors du chargement de aideetu.html:', err.message);
            res.status(404).json({ error: 'Page aideetu non trouvée' });
        } else {
            console.log('aideetu.html servi avec succès');
            res.status(200);
        }
    });
});

app.use((req, res) => {
    console.log(`Route non trouvée: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Route non trouvée' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur démarré sur http://localhost:${PORT}`));