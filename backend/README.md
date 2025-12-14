# 🏆 Funia Întrebărilor - Platformă Educațională Interactivă

O platformă completă pentru jocuri educative de tip "tras funia" bazate pe întrebări, similar Kahoot.

## ✨ Caracteristici

### 👨‍🏫 Pentru Profesori:
- ✅ Creare sesiuni de joc cu cod unic
- ✅ Adăugare întrebări cu răspunsuri multiple
- ✅ Vizualizare live a progresului
- ✅ Administrare participanți
- ✅ Statistici și rapoarte

### 👨‍🎓 Pentru Elevi:
- ✅ Alăturare la sesiuni prin cod
- ✅ Răspuns la întrebări în timp real
- ✅ Competiție între echipe (Roșu vs Albastru)
- ✅ Vizualizare clasament
- ✅ Istoric jocuri

### 🚀 Tehnologii:
- **Frontend**: HTML5, CSS3, JavaScript (ES6+), Socket.IO
- **Backend**: Node.js, Express, MongoDB, Socket.IO
- **Autentificare**: Firebase Auth, JWT
- **Deployment**: Docker, Nginx

## 🚀 Instalare și Rulare

### Prerequisites
- Node.js 18+
- MongoDB 6+
- Docker și Docker Compose (opțional)

### 1. Rulare cu Docker (Recomandat)
```bash
# Clonează repository-ul
git clone https://github.com/username/tug-of-war-platform.git
cd tug-of-war-platform

# Configurează variabilele de mediu
cp .env.example .env
# Editează .env cu valorile tale

# Pornește aplicația
docker-compose up -d
