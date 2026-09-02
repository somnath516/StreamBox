const fs = require('fs');
const path = require('path');
const { db } = require('../backend/db');

async function migrate() {
  try {
    // Read old JSON
    const oldData = path.join(__dirname, '..', 'data', 'movies.json');
    if (!fs.existsSync(oldData)) {
      console.log('No old JSON - fresh start');
      return;
    }
    
    const movies = JSON.parse(fs.readFileSync(oldData, 'utf8'));
    
    // Clear old table, insert new
    await new Promise(r => db.run('DELETE FROM movies', r));
    
    for (const movie of movies) {
      await new Promise((resolve, reject) => {
        db.run(`INSERT INTO movies (id, title, description, movie, subtitle, thumbnail, duration, category, createdAt, views)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [movie.id, movie.title, movie.description || '', movie.movie, movie.subtitle || null, movie.thumbnail || null, movie.duration || 0, movie.category || 'Movie', movie.createdAt || new Date().toISOString(), movie.views || 0],
          err => err ? reject(err) : resolve()
        );
      });
      console.log(`Migrated: ${movie.title}`);
    }
    
    console.log(`✅ Migration complete: ${movies.length} movies`);
  } catch (e) {
    console.error('Migration failed:', e);
  }
}

migrate();
