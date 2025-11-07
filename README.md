# ChromaKnit 🧶

Extract dominant colors from yarn photos to visualize how they'd look on garments.

## 🎯 Current Status: Phase 1 - Color Extraction

**What it does:**
- Extracts the 5 most dominant colors from yarn photos using K-means clustering
- Ranks colors by frequency (most common first)
- Outputs hex codes and a visual color palette

## 🚀 Quick Start

### Setup
```bash
# Clone the repo
git clone https://github.com/charlyx125/chromaknit.git
cd chromaknit

(optional) Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install opencv-python numpy scikit-learn matplotlib
```

### Usage
```bash
# 1. Add your yarn photo to the photos/ folder
cp your_yarn.jpg photos/

# 2. Run the extractor (edit image filename in the script)
python yarn_extractor.py

# 3. Check results/ for the output visualization
```

## 📸 Example

**Input:** Close-up photo of multicolored yarn
**Output:** 5 dominant colors ranked by frequency with hex codes
```
Cluster | Pixel Count | Percentage | Hex Code
------------------------------------------------------------
   2    |    456,789  |  45.20%   | #6b9bd1
   0    |    234,567  |  23.18%   | #4a7ba9
   4    |    156,432  |  15.47%   | #8fb5d8
   ...
```

## 🧠 Key Technical Decisions

### Color Extraction Algorithm
- **K-means clustering** (n_clusters=5)
- Operates in RGB color space
- Sorts results by pixel frequency (most dominant first)

### Why 5 colors?
Based on typical yarn compositions:
- Variegated yarns usually have 3-5 distinct colors
- 5 clusters balance detail vs. noise
- Can be adjusted later based on yarn type

## 🤔 Known Challenges & Next Steps

### Challenge 1: Close-up vs. Distance Color Perception
**Problem:** Yarn photos are close-up, but knitted garments are viewed from a distance. Colors that appear distinct up close (e.g., dark shadows between knots) blend together visually when knitted.

**Current Impact:**
- Dark artifact colors (shadows, gaps) are extracted as "dominant"
- These don't represent the actual yarn color in the final garment

**Proposed Solutions:**
1. **HSV Filtering** (Next step)
   - Filter out very dark colors (V < 30% in HSV)
   - Filter out very desaturated colors (S < 20%)
   - These are likely lighting artifacts, not yarn colors

2. **Brightness Threshold**
   - Ignore pixels below a certain brightness
   - Focuses on the actual yarn fibers, not gaps

3. **User Selection** (Future)
   - Show all 5 colors, let user deselect unwanted ones
   - UI: Click to toggle colors on/off

### Challenge 2: Background Removal
**Problem:** Non-yarn pixels (background, hands, surfaces) affect color extraction.

**Solution (Future):** 
- Manual crop before extraction
- Or: Background segmentation (Rembg)

## 📚 Project Roadmap

- [x] **Phase 1.1:** Basic color extraction (K-means)
- [ ] **Phase 1.2:** HSV filtering for artifact removal
- [ ] **Phase 1.3:** Make configurable (n_colors, filters)
- [ ] **Phase 2:** Garment recoloring module
- [ ] **Phase 3:** Web interface (FastAPI + React)
- [ ] **Phase 4:** Deploy and share

## 🛠️ Tech Stack

**Current:**
- Python 3.10+
- OpenCV (image loading)
- NumPy (array operations)
- scikit-learn (K-means clustering)
- Matplotlib (visualization)

**Future:**
- FastAPI (backend API)
- React (frontend UI)
- Rembg/SAM (garment segmentation)

## 📝 Development Notes

### What I'm Learning
- Computer vision fundamentals (color spaces, clustering)
- Image processing pipelines
- Balancing algorithm complexity vs. usability

### Interesting Findings
- K-means in RGB space works surprisingly well for yarn
- Sorting by frequency is crucial (otherwise colors are random)
- The "close-up vs. distance" problem is the main challenge

## 🤝 About This Project

This is a personal learning project to deepen my understanding of:
- Computer vision and image processing
- Full-stack development (eventually)
- Deploying ML models in production

Built by [Joyce Chong] | [GitHub](https://github.com/charlyx125)

---

⭐ Star this repo if you're interested in following the development!
