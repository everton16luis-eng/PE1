require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const frontEnd = path.join(__dirname, '../../frontend');
const app = express();
const PORT = process.env.PORT || 3000;
const dashboardRoutes = require('./routes/dashboardRoutes')
const eventosRoutes = require('./routes/eventoRoutes')
app.use(cors());
app.use(express.json());
app.use(express.static(frontEnd));
app.use('/api', dashboardRoutes);
app.use('/api', eventosRoutes);

app.get('/', (req, res)=>{
    res.sendFile(path.join(frontEnd, 'index.html'));
})
app.listen(PORT, () => {
    console.log(`API rodando em http://localhost:${PORT}`);
});