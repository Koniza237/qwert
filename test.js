const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

console.log('Initialisation des routes API...');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function readJson(file) {
    try {
        const data = await fs.readFile(file, 'utf8');
        console.log(`Lecture réussie de ${file}`);
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`Fichier ${file} non trouvé, retour d'un tableau vide`);
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
    rooms: 'ress-salle.json',
    admins: 'admin.json',
    students: 'students.json',
    documents: 'documents.json',
    courses: 'mescours.json',
    grades: 'mesnotes.json',
    subjects: 'matieres.json'
};

const emploitDir = path.join(__dirname, 'emploit');
fs.mkdir(emploitDir, { recursive: true }).catch(err => console.error('Erreur lors de la création du dossier emploit:', err));

const uploadsDir = path.join(__dirname, 'Uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(err => console.error('Erreur lors de la création du dossier uploads:', err));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
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
        const storedCode = codeData.code;

        if (code === storedCode) {
            console.log('Code vérifié avec succès');
            return res.status(200).json({ message: 'Code vérifié avec succès' });
        } else {
            console.warn('Code incorrect soumis:', code);
            return res.status(400).json({ error: 'Code invalide. Veuillez réessayer.' });
        }
    } catch (err) {
        console.error('Erreur lors de la vérification du code:', err.message);
        return res.status(500).json({ error: 'Erreur serveur lors de la vérification du code' });
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
        } else {
            if (!req.body.email || !req.body.password) {
                return res.status(400).json({ error: 'Email et mot de passe requis pour les enseignants et administrateurs' });
            }
            if (typeof req.body.email !== 'string') {
                return res.status(400).json({ error: 'L\'email doit être une chaîne de caractères' });
            }
            if (data.some(u => u.email && typeof u.email === 'string' && u.email.toLowerCase() === req.body.email.toLowerCase())) {
                return res.status(400).json({ error: 'Un utilisateur avec cet email existe déjà' });
            }
        }
        const newUser = { 
            id: data.length ? Math.max(...data.map(u => u.id || 0)) + 1 : 1, 
            ...req.body,
            lastUpdated: new Date().toISOString()
        };
        data.push(newUser);
        await writeJson(fileMap[type], data);
        res.json(newUser);
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
        } else if (req.body.email && typeof req.body.email !== 'string') {
            return res.status(400).json({ error: 'L\'email doit être une chaîne de caractères' });
        } else if (req.body.email && data.some(u => u.id !== parseInt(id) && u.email && typeof u.email === 'string' && u.email.toLowerCase() === req.body.email.toLowerCase())) {
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
        if (!fileMap[type]) {
            return res.status(400).json({ error: 'Type invalide' });
        }
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
        data = data.filter((_, i) => i !== index);
        await writeJson(fileMap[type], data);
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
        data[index] = { ...data[index], ...req.body };
        await writeJson(fileMap.subjects, data);
        res.json(data[index]);
    } catch (err) {
        console.error('Erreur lors de la modification de matieres.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
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
        const { title, category, uploadedBy } = req.body;
        if (!title || !category || !req.file) {
            return res.status(400).json({ error: 'Titre, catégorie et fichier requis' });
        }
        const data = await readJson(fileMap.documents);
        const newDocument = {
            id: data.length ? Math.max(...data.map(d => d.id)) + 1 : 1,
            title,
            category,
            fileName: req.file.filename,
            uploadedBy: uploadedBy || 'Admin',
            uploadDate: new Date().toISOString().slice(0, 16).replace('T', ' ')
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
        const filePath = path.join(uploadsDir, document.fileName);
        res.download(filePath, document.fileName, (err) => {
            if (err) {
                console.error('Erreur lors du téléchargement du fichier:', err.message);
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
        const filePath = path.join(UploadsDir, document.fileName);
        await fs.unlink(filePath).catch(err => {
            console.error('Erreur lors de la suppression du fichier:', err.message);
        });
        data = data.filter(d => d.id !== parseInt(id));
        await writeJson(fileMap.documents, data);
        res.json({ message: 'Document supprimé' });
    } catch (err) {
        console.error('Erreur lors de la suppression du document:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/courses', async (req, res) => {
    console.log('Requête GET /api/courses reçue');
    try {
        const data = await readJson(fileMap.courses);
        res.json(data);
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
        const data = await readJson(fileMap.courses);
        const newCourse = {
            id: data.length ? Math.max(...data.map(c => c.id)) + 1 : 1,
            name: req.file.originalname,
            uploadedBy: uploadedBy || 'Étudiant',
            uploadDate: new Date().toISOString().slice(0, 16).replace('T', ' ')
        };
        data.push(newCourse);
        await writeJson(fileMap.courses, data);
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
        let data = await readJson(fileMap.courses);
        const course = data.find(c => c.id === parseInt(id));
        if (!course) {
            return res.status(404).json({ error: 'Cours non trouvé' });
        }
        const filePath = path.join(UploadsDir, course.name);
        await fs.unlink(filePath).catch(err => {
            console.error('Erreur lors de la suppression du fichier:', err.message);
        });
        data = data.filter(c => c.id !== parseInt(id));
        await writeJson(fileMap.courses, data);
        res.json({ message: 'Cours supprimé' });
    } catch (err) {
        console.error('Erreur lors de la suppression du cours:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/grades', async (req, res) => {
    console.log('Requête GET /api/grades reçue');
    try {
        const data = await readJson(fileMap.grades);
        res.json(data);
    } catch (err) {
        console.error('Erreur lors de la lecture de mesnotes.json:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/grades', async (req, res) => {
    console.log('Requête POST /api/grades reçue', req.body);
    try {
        const { subject, grade, coefficient, addedBy, addDate } = req.body;
        if (!subject || !grade || !coefficient) {
            return res.status(400).json({ error: 'Matière, note et coefficient requis' });
        }
        const data = await readJson(fileMap.grades);
        const newGrade = {
            id: data.length ? Math.max(...data.map(g => g.id)) + 1 : 1,
            subject,
            grade,
            coefficient,
            addedBy: addedBy || 'Étudiant',
            addDate: addDate || new Date().toISOString().slice(0, 16).replace('T', ' ')
        };
        data.push(newGrade);
        await writeJson(fileMap.grades, data);
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
        const data = await readJson(fileMap.grades);
        const newGrade = {
            id: data.length ? Math.max(...data.map(g => g.id)) + 1 : 1,
            subject: req.file.originalname,
            grade: null,
            coefficient: null,
            addedBy: uploadedBy || 'Étudiant',
            addDate: new Date().toISOString().slice(0, 16).replace('T', ' ')
        };
        data.push(newGrade);
        await writeJson(fileMap.grades, data);
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
        let data = await readJson(fileMap.grades);
        const grade = data.find(g => g.id === parseInt(id));
        if (!grade) {
            return res.status(404).json({ error: 'Note non trouvée' });
        }
        if (grade.subject) {
            const filePath = path.join(UploadsDir, grade.subject);
            await fs.unlink(filePath).catch(err => {
                console.error('Erreur lors de la suppression du fichier:', err.message);
            });
        }
        data = data.filter(g => g.id !== parseInt(id));
        await writeJson(fileMap.grades, data);
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
        const idx = parseInt(index);
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
                const match = file.match(/timetable_(\d{4}-\d{2}-\d{2})_(.+)\.json/);
                return {
                    name: file,
                    date: match ? match[1] : 'Inconnu',
                    group: match ? match[2] : 'Inconnu'
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

app.post('/api/export-timetable', async (req, res) => {
    console.log('Requête POST /api/export-timetable reçue', req.body);
    const { timetables, date, group } = req.body;
    if (!timetables || !date || !group) {
        return res.status(400).json({ error: 'Données, date ou groupe manquants' });
    }
    try {
        const fileName = `timetable_${date}_${group}.json`;
        const timetableData = { date, group, timetable: timetables };
        await writeJson(path.join(emploitDir, fileName), timetableData);
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
        const rooms = await readJson(fileMap.rooms);
        const constraints = await readJson('constraints.json');
        const subjects = await readJson(fileMap.subjects);

        if (!teachers.length || !groups.length || !rooms.length || !subjects.length) {
            return res.status(400).json({ error: 'Données insuffisantes pour générer l\'emploi du temps' });
        }

        const timeSlots = ['08:00-10:00', '10:00-12:00', '13:00-15:00', '15:00-17:00'];
        const days = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
        const result = [];
        const assignments = new Map();

        const isSlotAvailable = (teacher, group, room, day, slot) => {
            const slotKey = `${day}_${slot}`;
            const slotAssignments = assignments.get(slotKey) || [];
            return !slotAssignments.some(a => 
                a.teacher === teacher || a.group === group || a.room === room
            );
        };

        const assignSlot = (teacher, group, room, subject, day, slot) => {
            const slotKey = `${day}_${slot}`;
            const slotAssignments = assignments.get(slotKey) || [];
            slotAssignments.push({ teacher, group, room, subject });
            assignments.set(slotKey, slotAssignments);
        };

        const getRandomElement = (array) => array[Math.floor(Math.random() * array.length)];

        for (const group of groups) {
            const timetable = timeSlots.map(slot => ({
                time: slot,
                date,
                lundi: '',
                mardi: '',
                mercredi: '',
                jeudi: '',
                vendredi: ''
            }));

            for (const day of days) {
                for (const slot of timeSlots) {
                    const slotIndex = timeSlots.indexOf(slot);
                    const availableTeachers = teachers.filter(t => 
                        isSlotAvailable(t.name, group.name, null, day, slot)
                    );
                    const availableRooms = rooms.filter(r => 
                        isSlotAvailable(null, group.name, r.name, day, slot)
                    );

                    if (availableTeachers.length && availableRooms.length) {
                        const teacher = getRandomElement(availableTeachers);
                        const room = getRandomElement(availableRooms);
                        const subject = teacher.subjects || getRandomElement(subjects).name;

                        timetable[slotIndex][day] = `${subject} (${teacher.name}, ${group.name}, ${room.name})`;
                        assignSlot(teacher.name, group.name, room.name, subject, day, slot);
                    } else {
                        console.warn(`No available teacher or room for ${group.name} on ${day} ${slot}`);
                    }
                }
            }

            for (const constraint of constraints) {
                if (constraint.type !== 'Indisponible' || !constraint.teacher) continue;
                const day = constraint.day.toLowerCase();
                const slot = constraint.time;
                if (!days.includes(day) || !timeSlots.includes(slot)) continue;

                const slotIndex = timeSlots.indexOf(slot);
                if (timetable[slotIndex][day].includes(constraint.teacher)) {
                    timetable[slotIndex][day] = 'Libre';
                    const slotKey = `${day}_${slot}`;
                    assignments.set(slotKey, []);
                }
            }

            const fileName = `timetable_${date}_${group.name}.json`;
            await writeJson(path.join(emploitDir, fileName), timetable);
            result.push({ date, group: group.name, timetable });
        }

        res.json(result);
    } catch (err) {
        console.error('Erreur lors de la génération de l\'emploi du temps:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/export-pdf', async (req, res) => {
    console.log('Requête POST /api/export-pdf reçue', req.body);
    const { timetables, date, group } = req.body;
    if (!timetables || !date || !group) {
        return res.status(400).json({ error: 'Données, date ou groupe manquants' });
    }
    try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const tempDir = path.join(__dirname, 'temp');
        await fs.mkdir(tempDir, { recursive: true }).catch(err => console.error('Erreur lors de la création du dossier temp:', err.message));
        const pdfFilePath = path.join(tempDir, `timetable_${group}_${date}.pdf`);

        const writeStream = fsSync.createWriteStream(pdfFilePath);
        doc.pipe(writeStream);

        doc.fontSize(16).text(`Emploi du Temps - Fareno University`, { align: 'center' });
        doc.fontSize(12).text(`Groupe: ${group} | Semaine du ${date}`, { align: 'center' });
        doc.moveDown(2);

        const tableTop = doc.y;
        const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
        const colWidths = [60, ...days.map(() => 90)];
        const rowHeight = 40;
        const tableWidth = colWidths.reduce((sum, w) => sum + w, 0);
        const tableLeft = (doc.page.width - tableWidth) / 2;

        doc.fontSize(10).font('Helvetica-Bold');
        let x = tableLeft;
        ['Heure', ...days].forEach((header, i) => {
            doc.rect(x, tableTop, colWidths[i], rowHeight).fill('#3b82f6');
            doc.fillColor('white').text(header, x + 5, tableTop + 15, { width: colWidths[i] - 10, align: 'center' });
            x += colWidths[i];
        });

        doc.font('Helvetica').fillColor('black');
        let y = tableTop + rowHeight;
        timetables.forEach((t, index) => {
            x = tableLeft;
            const cells = [t.time || '-', t.lundi || '-', t.mardi || '-', t.mercredi || '-', t.jeudi || '-', t.vendredi || '-'];
            cells.forEach((cell, i) => {
                doc.rect(x, y, colWidths[i], rowHeight).stroke();
                doc.text(cell, x + 5, y + 5, { width: colWidths[i] - 10, height: rowHeight - 10, align: 'center', lineBreak: true });
                x += colWidths[i];
            });
            y += rowHeight;

            if (t.time === '10:00-12:00') {
                x = tableLeft;
                const pauseCells = ['12:00-13:00', 'Pause', 'Pause', 'Pause', 'Pause', 'Pause'];
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
            res.download(pdfFilePath, `timetable_${date}_${group}.pdf`, err => {
                if (err) {
                    console.error('Erreur lors du téléchargement du PDF:', err.message);
                    res.status(500).json({ error: 'Erreur serveur lors du téléchargement' });
                }
                fs.unlink(pdfFilePath).catch(err => console.error('Erreur lors de la suppression du fichier PDF:', err.message));
            });
        });

        writeStream.on('error', err => {
            console.error('Erreur lors de l\'écriture du PDF:', err.message);
            res.status(500).json({ error: 'Erreur serveur lors de la génération du PDF' });
        });
    } catch (err) {
        console.error('Erreur lors de l\'exportation en PDF:', err.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.use(express.static(__dirname));
console.log('Routes statiques configurées pour:', __dirname);

app.get('/aideetu.html', (req, res) => {
    console.log('Requête GET /aideetu.html reçue');
    const filePath = path.join(__dirname, 'aideetu.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('Erreur lors du chargement de aideetu.html:', err.message);
            res.status(404).json({ error: 'Page aideetu.html non trouvée' });
        } else {
            console.log('aideetu.html servi avec succès');
            res.status(200);
        }
    });
});

app.use((req, res, next) => {
    console.log(`Route non trouvée: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Route non trouvée' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur démarré sur http://localhost:${PORT}`));