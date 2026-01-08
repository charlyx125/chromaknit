import { useState } from 'react'
import ImageUpload from './ImageUpload'
import './App.css'

function App() {
  const [yarnImage, setYarnImage] = useState<File | null>(null)

  const handleYarnUpload = (file: File) => {
    setYarnImage(file)
    console.log('Yarn image uploaded:', file.name)
  }

  return (
    <div className="app">
      <header>
        <h1>🧶 ChromaKnit</h1>
        <p>Preview yarn colors on garments before buying</p>
      </header>

      <main>
        <section className="step">
          <h2>Step 1: Upload Yarn Photo</h2>
          
          <ImageUpload
            label="Drop yarn image here"
            onImageSelect={handleYarnUpload}
          />
          
          {yarnImage && (
            <p style={{ marginTop: '1rem', color: '#4ECDC4' }}>
              ✅ Uploaded: {yarnImage.name}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}

export default App