import { useState } from 'react'

interface ImageUploadProps {
  label: string
  onImageSelect: (file: File) => void
}

function ImageUpload({ label, onImageSelect }: ImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (file.size > 5 * 1024 * 1024) {
      alert("File must be less than 5MB")
      return
    }
    
    if (!file.type.startsWith('image/')) {
      alert("File must be an image")
      return
    }
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      setPreviewUrl(url)
    }
    reader.readAsDataURL(file)
    
    onImageSelect(file)
  }

  return (
    <div>
      <p>{label}</p>
      
      <input 
        type="file" 
        accept="image/*"
        onChange={handleFileChange}
      />
      
      {previewUrl && <img src={previewUrl} alt="Preview" />}
    </div>
  )
}

export default ImageUpload