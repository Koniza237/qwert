# FARENO - UNIVERSITY (Version 2)

![Bannière FARENO University](https://raw.githubusercontent.com/Koniza237/qwert/master/FARENOUNIVERSITY.jpg)  
*Une application web dynamique pour la gestion des emplois du temps universitaires.*

## Aperçu

FARENO - UNIVERSITY est une plateforme web complète conçue pour une gestion efficace des emplois du temps universitaires. Cette Version 2 se concentre sur les fonctionnalités principales pour les administrateurs, les enseignants et les étudiants, permettant de créer, visualiser et mettre à jour les emplois du temps de manière fluide.

### Fonctionnalités Clés
- **Authentification des Utilisateurs** : Connexion sécurisée pour différents rôles (admin, enseignants, étudiants).
- **Gestion des Emplois du Temps** : Créer, modifier et supprimer des emplois du temps avec une interface drag-and-drop.
- **Mises à Jour en Temps Réel** : Propulsé par Node.js pour une synchronisation instantanée entre les utilisateurs.
- **Conception Responsive** : Interface entièrement adaptée aux mobiles utilisant HTML5, CSS3 et JavaScript.
- **Intégration Calendrier** : Exporter les emplois du temps vers iCal ou Google Calendar.
- **Notifications** : Alertes par email/SMS pour les changements d'emploi du temps.

Ce projet est open-source sous la licence Apache 2.0, encourageant les contributions pour améliorer les systèmes de gestion universitaire dans le monde entier.

## Pile Technologique
- **Frontend** : HTML5, CSS3 (avec Flexbox/Grid pour les mises en page), JavaScript (ES6+ pour l'interactivité).
- **Backend** : Node.js avec Express.js pour les endpoints API gérant les données d'emploi du temps.
- **Base de Données** : MongoDB (ou SQLite pour une configuration légère) pour stocker les informations des utilisateurs et des emplois du temps.
- **Autres Outils** : npm pour la gestion des paquets, Git pour le contrôle de version.

## Installation

1. Clonez le dépôt :
   ```
   git clone https://github.com/Koniza237/Fareno-university.git
   ```
2. Naviguez dans le répertoire du projet :
   ```
   cd Fareno-university
   ```
3. Installez les dépendances :
   ```
   npm install
   ```
4. Configurez les variables d'environnement (créez un fichier `.env`) :
   ```
   PORT=3000
   DATABASE_URL=mongodb://localhost/fareno-university
   ```
5. Démarrez le serveur :
   ```
   npm start
   ```
6. Ouvrez votre navigateur et visitez `http://localhost:3000` pour accéder à l'application.

## Utilisation

### Tableau de Bord Admin
- Connectez-vous en tant qu'admin pour gérer les utilisateurs et les emplois du temps globaux.
- Démo Vidéo : Découvrez comment créer un nouvel emploi du temps.  
  <video src="assets/admin-timetable-creation.mp4" width="600" controls></video>  
  *(Vidéo professionnelle hébergée sur GitHub – une démonstration de 2 minutes sur la création d'emplois du temps. Téléchargez et placez le fichier MP4 dans le dossier `assets/` du dépôt.)*

### Vue Étudiant
- Les étudiants peuvent visualiser leurs emplois du temps personnalisés et recevoir des mises à jour.
- Démo Vidéo : Exploration du tableau de bord étudiant.  
  <video src="assets/student-schedule-view.mp4" width="600" controls></video>  
  *(Vidéo professionnelle hébergée sur GitHub – démonstration sur la consultation d'emploi du temps avec mises à jour en temps réel. Téléchargez et placez le fichier MP4 dans le dossier `assets/` du dépôt.)*

### Outils pour les Enseignants
- Les enseignants peuvent assigner des cours et résoudre les conflits.
- Démo Vidéo : Planification drag-and-drop en action.  
  <video src="assets/teacher-tools-demo.mp4" width="600" controls></video>  
  *(Vidéo professionnelle hébergée sur GitHub – guide sur la création d'emplois du temps avec interface interactive. Téléchargez et placez le fichier MP4 dans le dossier `assets/` du dépôt.)*

## Captures d'Écran

![Page de Connexion](https://raw.githubusercontent.com/Koniza237/qwert/master/login.png)  
*Écran de connexion sécurisé avec accès basé sur les rôles.*

![Vue Emploi du Temps](https://raw.githubusercontent.com/Koniza237/qwert/master/exportation.png)  
*Vue interactive du calendrier pour les emplois du temps.*

## Contribution

Nous accueillons les contributions ! Suivez ces étapes :
1. Forkez le dépôt.
2. Créez une nouvelle branche : `git checkout -b feature/votre-fonctionnalité`.
3. Validez vos changements : `git commit -m 'Ajout d'une fonctionnalité'`.
4. Poussez vers la branche : `git push origin feature/votre-fonctionnalité`.
5. Ouvrez une Pull Request.

Pour les changements majeurs, ouvrez d'abord une issue pour discuter de ce que vous souhaitez modifier.

## Feuille de Route
- **Version 2.1** : Ajout d'algorithmes de détection de conflits.
- **Version 3.0** : Intégration d'IA pour la planification automatisée.
- Futur : Application mobile complémentaire utilisant React Native.

## Licence

Sous licence Apache 2.0. Voir [LICENSE](LICENSE) pour plus d'informations.

## Contact

- GitHub : [Koniza237](https://github.com/Koniza237)
- Email : konizakoniza3@gmail.com
- Email : germainraphaelangoulaonambele@gmail.com
