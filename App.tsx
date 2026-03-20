import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { adTemplates, platforms, CameraIcon, PackageIcon, SparklesIcon, DownloadIcon, Loader2Icon, PlusIcon, XIcon, CopyIcon, EditIcon, TwitterIcon, FacebookIcon, InstagramIcon } from './constants';
import type { Selfie, Product, AdVariation, SelfieQualityReport } from './types';
import { analyzeImage, generateAdImage, generateAdCaption, analyzeSelfieQuality } from './services/geminiService';
import Cropper from 'react-easy-crop';
import type { Point, Area } from 'react-easy-crop';

declare global {
  // FIX: Augment the existing AIStudio interface instead of redeclaring property on Window to avoid conflicts.
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}

// FIX: Corrected a typo in the viewBox attribute of the SVG component below, which was causing multiple parsing errors.
const AlertTriangleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" x2="12" y1="9" y2="13"></line><line x1="12" x2="12.01" y1="17" y2="17"></line></svg>
);

const ArrowLeftIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
);

const BrushIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/></svg>
);

const CheckCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);

const UserCheckIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
);

const UserIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);

const personas = [
    { name: 'Fitness & Sport', mood: 'Energetic & Motivating', outfit: 'Athleisure / Sportswear', location: 'Modern Gym / Outdoor Track' },
    { name: 'Entrepreneur & Business', mood: 'Professional & Ambitious', outfit: 'Business Casual', location: 'Modern Office / Co-working Space' },
    { name: 'Student & Campus Life', mood: 'Focused & Creative', outfit: 'Casual Streetwear', location: 'University Campus / Library' },
    { name: 'Nature & Adventure', mood: 'Calm & Organic', outfit: 'Outdoor / Hiking Gear', location: 'Scenic Mountain Trail' },
    { name: 'Urban & Street Style', mood: 'Trendy & Edgy', outfit: 'Fashionable Streetwear', location: 'Urban Cityscape at Golden Hour' },
    { name: 'Custom Persona', mood: 'Custom', outfit: 'Custom', location: 'Custom' },
];

const productPlacementSuggestions = [
    "Held in hand (Close-up)",
    "On a wooden table",
    "On a shelf",
    "In a flat lay",
    "Next to a relevant object",
    "Floating creatively",
    "In background (Environmental)",
    "Being used by person",
    "Minimalist studio setting"
];


type AspectRatioOption = 'Original' | '1:1' | '4:5' | '16:9';

const ASPECT_RATIOS: { [key in AspectRatioOption]: number | null } = {
  'Original': null,
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9,
};

async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], fileName, { type: 'image/jpeg' });
}

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
};

const ImageEditor = ({ imageFile, onSave, onClose }: { imageFile: File, onSave: (newFile: File) => void, onClose: () => void }) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropAspectRatio, setCropAspectRatio] = useState<AspectRatioOption>('Original');
  const imageUrl = useMemo(() => URL.createObjectURL(imageFile), [imageFile]);

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;

    const image = new Image();
    image.src = imageUrl;
    await new Promise(resolve => image.onload = resolve);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = croppedAreaPixels.width;
    canvas.height = croppedAreaPixels.height;

    ctx.drawImage(
      image,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      croppedAreaPixels.width,
      croppedAreaPixels.height
    );

    const dataUrl = canvas.toDataURL('image/jpeg');
    const newFile = await dataUrlToFile(dataUrl, imageFile.name);
    onSave(newFile);
  };

  useEffect(() => {
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl">
        <div className="relative h-96 bg-black">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={ASPECT_RATIOS[cropAspectRatio] ?? undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="mt-4 space-y-4">
            <div className='flex items-center gap-4'>
                <span>Zoom</span>
                <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
            </div>
            <div className='flex items-center gap-2'>
                <span>Aspect Ratio</span>
                {Object.keys(ASPECT_RATIOS).map((ratio) => (
                    <button key={ratio} onClick={() => setCropAspectRatio(ratio as AspectRatioOption)} className={`px-3 py-1 rounded-md text-sm ${cropAspectRatio === ratio ? 'bg-pink-500' : 'bg-gray-700'}`}>{ratio}</button>
                ))}
            </div>
        </div>
        <div className="mt-6 flex justify-end gap-4">
          <button onClick={onClose} className="px-4 py-2 rounded-md bg-gray-600 hover:bg-gray-500">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-md bg-pink-500 hover:bg-pink-600">Save</button>
        </div>
      </div>
    </div>
  );
};


const App = () => {
    const [selfie, setSelfie] = useState<Selfie | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [generating, setGenerating] = useState(false);
    const [adVariations, setAdVariations] = useState<AdVariation[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [editingImage, setEditingImage] = useState<{file: File, callback: (newFile: File) => void} | null>(null);
    const [shareNotification, setShareNotification] = useState<{ id: string; message: string } | null>(null);
    
    // New state for selfie quality check
    const [selfieQualityReport, setSelfieQualityReport] = useState<SelfieQualityReport | null>(null);
    const [isAnalyzingSelfie, setIsAnalyzingSelfie] = useState(false);

    // New state for creative direction
    const [selectedPersona, setSelectedPersona] = useState(personas[0]);
    const [customPersonaPrompt, setCustomPersonaPrompt] = useState('');
    
    const [customPrompt, setCustomPrompt] = useState('');
    const [productPlacement, setProductPlacement] = useState('');
    const [brandVoice, setBrandVoice] = useState('Playful and witty, use emojis.');

    // API Key State
    const [hasApiKey, setHasApiKey] = useState(false);
    const [apiKeyChecked, setApiKeyChecked] = useState(false);

    // Face Lock State
    const [useFaceLock, setUseFaceLock] = useState(true);

    useEffect(() => {
        const checkKey = async () => {
            try {
                const hasKey = await window.aistudio.hasSelectedApiKey();
                setHasApiKey(hasKey);
            } catch (e) {
                console.error("Error checking API key:", e);
                // Fallback safe default
                setHasApiKey(false);
            } finally {
                setApiKeyChecked(true);
            }
        };
        checkKey();
    }, []);

    const handleConnectKey = async () => {
        try {
            await window.aistudio.openSelectKey();
            // We assume success if the dialog closes and promise resolves
            setHasApiKey(true);
        } catch (e) {
            console.error("Error selecting key:", e);
        }
    };

    const handleSelfieUpload = async (file: File) => {
        setIsAnalyzingSelfie(true);
        setSelfieQualityReport(null);
        const preview = await fileToDataUrl(file);
        setSelfie({ file, preview });

        const dataUrl = await fileToDataUrl(file);
        const base64 = dataUrl.split(',')[1];
        const mimeType = file.type;
        const report = await analyzeSelfieQuality(base64, mimeType);
        setSelfieQualityReport(report);
        setIsAnalyzingSelfie(false);
    };

    const handleProductUpload = async (file: File) => {
        const preview = await fileToDataUrl(file);
        setProducts(prev => [...prev, { 
            id: `prod-${Date.now()}`, 
            file, 
            preview,
            name: '',
            brand: '',
            url: '',
        }]);
    };

    const updateProduct = (id: string, field: keyof Product, value: string) => {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };
    
    const removeProduct = (id: string) => {
        setProducts(products.filter(p => p.id !== id));
    };
    
    const startOver = () => {
        setSelfie(null);
        setProducts([]);
        setAdVariations([]);
        setError(null);
        setGenerating(false);
        setSelfieQualityReport(null);
        setIsAnalyzingSelfie(false);
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };
    
    const downloadImage = (dataUrl: string, filename: string) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleShare = (platform: 'twitter' | 'facebook', caption?: string) => {
        if (!caption) return;
        const encodedCaption = encodeURIComponent(caption);
        let url = '';

        switch (platform) {
            case 'twitter':
                url = `https://twitter.com/intent/tweet?text=${encodedCaption}`;
                break;
            case 'facebook':
                const appUrl = encodeURIComponent(window.location.href);
                url = `https://www.facebook.com/sharer/sharer.php?u=${appUrl}&quote=${encodedCaption}`;
                break;
        }

        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };
    
    const handleInstagramShare = (caption?: string, adId?: string) => {
        if (!caption || !adId) return;
        copyToClipboard(caption);
        setShareNotification({ id: adId, message: 'Caption copied! Download the image to post.' });
        setTimeout(() => setShareNotification(null), 4000);
    };

    const handleGenerate = async () => {
    // If Face Lock is on, we need a selfie. If not, we can proceed without it.
    if (useFaceLock && !selfie) {
      setError("Please upload a selfie for Face Lock mode, or switch to 'Fictional Model' mode.");
      return;
    }
    if (products.length === 0) {
      setError("Please upload at least one product image.");
      return;
    }
    setGenerating(true);
    setError(null);
    setAdVariations([]);

    try {
      // Create a single seed for this entire generation batch to ensure consistency.
      const generationSeed = Math.floor(Math.random() * 1000000);

      // Collect reference images to send directly to the generation model
      const referenceImages: { data: string, mimeType: string }[] = [];
      
      let selfieDesc = "";
      if (useFaceLock && selfie) {
        const selfieDataUrl = await fileToDataUrl(selfie.file);
        const selfieBase64 = selfieDataUrl.split(',')[1];
        const selfieMimeType = selfie.file.type;
        selfieDesc = await analyzeImage(selfieBase64, selfieMimeType, 'selfie');
        referenceImages.push({ data: selfieBase64, mimeType: selfieMimeType });
      }

      const productAnalysisPromises = products.map(async (p) => {
        const productDataUrl = await fileToDataUrl(p.file);
        const productBase64 = productDataUrl.split(',')[1];
        const productMimeType = p.file.type;
        // Add to reference images array in order
        return { 
            desc: await analyzeImage(productBase64, productMimeType, 'product'),
            data: productBase64,
            mimeType: productMimeType
        };
      });

      const processedProducts = await Promise.all(productAnalysisPromises);
      
      // Add product images to the reference list.
      // If selfie was added, it's at index 0. Products follow.
      // If no selfie, products start at index 0.
      processedProducts.forEach(p => {
          referenceImages.push({ data: p.data, mimeType: p.mimeType });
      });

      
      const generationResults = await Promise.allSettled(platforms.map(async (platform) => {
          const productListForPrompt = products.map((p, i) => {
            const urlInfo = p.url ? `(URL for context: ${p.url})` : '';
            return `PRODUCT #${i + 1} (${p.brand || 'Brand'} ${p.name || ''}): ${processedProducts[i].desc}`
          }).join('\n\n');
          
          let sceneDescription = "";
          
          if (selectedPersona.name === 'Custom Persona') {
              sceneDescription = `The scene is a realistic interpretation of the user's custom persona description: "${customPersonaPrompt}".
- **Mood & Atmosphere:** Derived directly from the custom description.
- **Outfit:** As described in the custom persona prompt.
- **Setting:** As described in the custom persona prompt.`;
          } else {
             sceneDescription = `The scene should be a realistic interpretation of a "${selectedPersona.name}" persona.
- **Setting:** A natural setting that looks like a real ${selectedPersona.location}. Avoid digital or artificial-looking backgrounds.
- **Mood:** The mood should be ${selectedPersona.mood}, achieved through natural lighting and candid posing.
- **Outfit:** The person should wear a realistic ${selectedPersona.outfit} that looks like it's made of real fabric.`;
          }

          const productPlacementDirective = productPlacement 
            ? `**PRODUCT PLACEMENT (CRITICAL):** ${productPlacement}. The product MUST be positioned exactly as described.`
            : `**PRODUCT PLACEMENT:** Integrate the product naturally into the scene (e.g., held in hand or on a surface nearby).`;

          let identityInstruction = "";
          let imageRefInstructions = "";

          if (useFaceLock) {
            identityInstruction = `
---
**IDENTITY LOCK (STRICT FACE PRESERVATION)**
---
**REFERENCE IMAGE 1 (THE PERSON):** The first image provided in the input is the SOURCE FACE.
**Instruction:** You must generate a person with this EXACT facial identity. Preserve facial structure, skin tone, eye shape, and age. Do not change their appearance.`;
            
            imageRefInstructions = `
**REFERENCE IMAGES PROVIDED:**
- Image 1: The Person (Strict Face Lock).
- Image 2 onwards: The Products (Strict Product fidelity).
`;
          } else {
            identityInstruction = `
---
**MODEL INSTRUCTION (FICTIONAL)**
---
Generate a professional, photorealistic model that fits the '${selectedPersona.name}' persona.
Do not use any specific real-world identity. Focus on high-quality, commercial aesthetics suitable for the brand.`;
            
            imageRefInstructions = `
**REFERENCE IMAGES PROVIDED:**
- Image 1 onwards: The Products (Strict Product fidelity).
`;
          }

          const imagePrompt = `
**PRIMARY GOAL: 8K PHOTOREALISM & 100% VISUAL CLONING**
The final image must be completely indistinguishable from a high-end commercial photograph.

${imageRefInstructions}

---
**PRODUCT FIDELITY (DO OR DIE)**
---
**CRITICAL:** The product images provided are the GROUND TRUTH. You must not hallucinate new text, change the logo, or alter the colors.
**Products to Feature:**
${productListForPrompt}
**Mandate:** Render the product exactly as shown in the reference images. If there is text, it must be legible and identical.
${productPlacementDirective}

${identityInstruction}

---
**SCENE & STYLE DIRECTION**
---
${sceneDescription}
- **User's Style Guide:** "${customPrompt || 'No specific style notes.'}"
- **Platform:** This ad is for ${platform.name} (${platform.ratio}).

---
**TECHNICAL & OPTICAL DIRECTIVES**
---
- **Camera:** Canon EOS R5, 50mm f/1.2 L lens. ISO 100.
- **Quality:** 8k resolution, raw photo style, highly detailed skin texture (pores, vellus hair), realistic fabric weaves.
- **Lighting:** Cinematic, physics-based lighting. No "AI glow" or plastic skin.
- **Imperfections:** Add subtle chromatic aberration, film grain, and natural skin asymmetry to force realism.
`;

          // Pass the reference images directly to the generation service
          const imageBase64 = await generateAdImage(imagePrompt, referenceImages, generationSeed);
          const caption = await generateAdCaption(selectedPersona.name === 'Custom Persona' ? 'Custom Brand Ambassador' : selectedPersona.name, platform.name, productListForPrompt, brandVoice);

          return {
            id: `${platform.id}-${Date.now()}`,
            template: `${selectedPersona.name} Ad`,
            platform: platform.name,
            ratio: platform.ratio,
            prompt: imagePrompt,
            preview: `data:image/jpeg;base64,${imageBase64}`,
            caption: caption
          };
      }));

      const processedResults: AdVariation[] = generationResults.map((result, index) => {
        const platform = platforms[index];
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          console.error(`Generation failed for ${platform.name}:`, result.reason);
           // Specific check for 404 which might indicate invalid project/key for this model
           if (result.reason instanceof Error && (result.reason.message.includes("Requested entity was not found") || result.reason.message.includes("404"))) {
              // We'll handle this globally in the catch block if possible, but since we are in Promise.allSettled, 
              // we need to signal it.
              throw new Error("Requested entity was not found. Please re-select your API key.");
           }
          return {
            id: `${platform.id}-${Date.now()}`,
            template: `${selectedPersona.name} Ad`,
            platform: platform.name,
            ratio: platform.ratio,
            error: result.reason instanceof Error ? result.reason.message : 'An unknown error occurred.',
          };
        }
      });
      
      setAdVariations(processedResults);
    } catch (err) {
      console.error('Generation error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      
      if (errorMessage.includes("Requested entity was not found") || errorMessage.includes("re-select your API key")) {
          setHasApiKey(false);
          setError("The selected API key or project is invalid for this model. Please select a valid key.");
          // Trigger the selection dialog again after a brief moment or let the user click the button
          await handleConnectKey();
          return;
      }
      
      setError(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

    const SelfieQualityFeedback = ({ report, loading }: { report: SelfieQualityReport | null, loading: boolean }) => {
        if (loading) {
            return (
                <div className="mt-4 flex items-center gap-3 text-gray-400">
                    <Loader2Icon className="w-5 h-5 animate-spin" />
                    <span>Analyzing selfie quality...</span>
                </div>
            )
        }

        if (!report) return null;

        const scoreColor = report.score >= 8 ? "text-green-400" : report.score >= 5 ? "text-yellow-400" : "text-red-400";
        const scoreBg = report.score >= 8 ? "bg-green-500/20" : report.score >= 5 ? "bg-yellow-500/20" : "bg-red-500/20";
        const verdict = report.score >= 8 ? "Great!" : report.score >= 5 ? "Good" : "Needs Improvement";

        return (
            <div className={`mt-4 p-4 rounded-lg border ${scoreBg.replace('bg-', 'border-')} ${scoreColor}`}>
                <h4 className="font-bold flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5"/>
                    Selfie Quality Report: <span className="font-extrabold">{verdict} (Score: {report.score}/10)</span>
                </h4>
                <ul className="mt-2 ml-1 text-sm list-disc list-inside space-y-1 text-gray-300">
                    {report.feedback.map((tip, i) => <li key={i}>{tip}</li>)}
                </ul>
            </div>
        )
    }

    if (!apiKeyChecked) {
        return <div className="min-h-screen bg-gray-900 flex items-center justify-center"><Loader2Icon className="w-10 h-10 animate-spin text-pink-500"/></div>
    }

    if (!hasApiKey) {
        return (
            <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6 text-center">
                <div className="max-w-md w-full bg-black/30 p-8 rounded-2xl border border-white/10 backdrop-blur-xl">
                    <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-violet-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <SparklesIcon className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold mb-4">Unlock Premium Access</h1>
                    <p className="text-gray-400 mb-8 leading-relaxed">
                        To create stunning 8K photorealistic ads with <span className="text-white font-semibold">Gemini 3.0 Pro</span>, you need to connect a paid API key from Google AI Studio.
                    </p>
                    <button 
                        onClick={handleConnectKey}
                        className="w-full bg-white text-black hover:bg-gray-200 font-bold py-4 px-6 rounded-xl text-lg flex items-center justify-center gap-2 transition-transform hover:scale-105"
                    >
                        Connect API Key <ArrowLeftIcon className="w-5 h-5 rotate-180" />
                    </button>
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="block mt-6 text-sm text-gray-500 hover:text-pink-400 transition-colors">
                        Learn more about API billing
                    </a>
                </div>
            </div>
        )
    }

    return (
    <div className="bg-gray-900 text-white min-h-screen font-sans">
      <header className="bg-black/20 backdrop-blur-sm border-b border-white/10 sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
                 <div className="flex items-center gap-3">
                    <SparklesIcon className="w-7 h-7 bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-violet-500" />
                    <h1 className="text-xl font-bold">AI Ad Generator</h1>
                </div>
                {adVariations.length > 0 && !generating && (
                    <button onClick={startOver} className="bg-white/10 hover:bg-white/20 px-4 py-2 text-sm rounded-lg font-semibold flex items-center gap-2">
                        <ArrowLeftIcon className="w-4 h-4" />
                        Start Over
                    </button>
                )}
            </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {adVariations.length === 0 && !generating ? (
            <div className='max-w-7xl mx-auto'>
                <div className="text-center mb-12">
                  <h2 className="text-4xl lg:text-5xl font-extrabold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-violet-500">Create Stunning Ads in Seconds</h2>
                  <p className="text-lg text-gray-400">Just upload your assets, set the vibe, and let AI do the magic.</p>
                </div>
                
                {error && (
                    <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-lg mb-8 flex items-center gap-3">
                      <AlertTriangleIcon className='w-5 h-5'/>
                      <p>{error}</p>
                    </div>
                )}
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column: Selfie & Products */}
                  <div className="space-y-8">
                    {/* Selfie Section */}
                    <div className="bg-black/20 p-6 rounded-2xl border border-white/10 flex flex-col">
                        <div className='flex items-center justify-between mb-4'>
                            <div className='flex items-center gap-3'>
                                <CameraIcon className="w-6 h-6 text-gray-400" />
                                <h3 className="text-xl font-bold">1. Your Selfie</h3>
                            </div>
                            <div className="flex items-center bg-black/40 rounded-full p-1 border border-white/10">
                                <button
                                    onClick={() => setUseFaceLock(true)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${useFaceLock ? 'bg-pink-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <UserCheckIcon className="w-3 h-3" />
                                    Face Lock
                                </button>
                                <button
                                    onClick={() => setUseFaceLock(false)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${!useFaceLock ? 'bg-violet-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <UserIcon className="w-3 h-3" />
                                    Fictional Model
                                </button>
                            </div>
                        </div>
                        
                        {useFaceLock ? (
                             <div className="flex-grow flex flex-col items-center justify-center bg-white/5 border-2 border-dashed border-white/20 rounded-xl p-6 transition-all animate-in fade-in">
                                {selfie ? (
                                    <div className='relative group'>
                                        <img src={selfie.preview} alt="Selfie preview" className="w-48 h-48 rounded-full object-cover shadow-lg" />
                                        <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <label htmlFor="selfie-upload" className="font-bold text-white cursor-pointer hover:underline">
                                                Change
                                            </label>
                                            <button
                                                onClick={() => {
                                                    const callback = async (newFile: File) => {
                                                        const dataUrl = await fileToDataUrl(newFile);
                                                        setSelfie({ file: newFile, preview: dataUrl });
                                                        
                                                        // Re-run quality analysis on the edited selfie
                                                        setIsAnalyzingSelfie(true);
                                                        setSelfieQualityReport(null);
                                                        const base64 = dataUrl.split(',')[1];
                                                        const mimeType = newFile.type;
                                                        const report = await analyzeSelfieQuality(base64, mimeType);
                                                        setSelfieQualityReport(report);
                                                        setIsAnalyzingSelfie(false);
                                                    };
                                                    setEditingImage({ file: selfie.file, callback });
                                                }}
                                                className="font-bold text-white flex items-center gap-1.5 cursor-pointer hover:underline"
                                            >
                                                <EditIcon className="w-4 h-4" />
                                                <span>Edit</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-24 h-24 rounded-full bg-black/30 flex items-center justify-center mb-4">
                                            <CameraIcon className="w-10 h-10 text-gray-500" />
                                        </div>
                                        <p className="text-gray-400 text-center mb-4">Good lighting works best!</p>
                                        <label htmlFor="selfie-upload" className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-lg font-bold cursor-pointer transition-colors">
                                            Choose File
                                        </label>
                                    </>
                                )}
                                <input type="file" accept="image/*" onChange={(e) => e.target.files && handleSelfieUpload(e.target.files[0])} className="hidden" id="selfie-upload" />
                                <SelfieQualityFeedback report={selfieQualityReport} loading={isAnalyzingSelfie} />
                            </div>
                        ) : (
                            <div className="flex-grow flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-xl p-8 text-center animate-in fade-in">
                                <UserIcon className="w-16 h-16 text-violet-400 mb-4 opacity-50" />
                                <h4 className="text-lg font-bold text-violet-300 mb-2">Fictional Model Mode Active</h4>
                                <p className="text-gray-400 text-sm max-w-xs">
                                    The AI will generate a professional model that matches your chosen <strong>Persona</strong> (e.g., Fitness, Business). Your selfie will not be used.
                                </p>
                            </div>
                        )}
                       
                    </div>

                    {/* Products Section */}
                    <div className="bg-black/20 p-6 rounded-2xl border border-white/10 flex flex-col">
                        <div className='flex items-center gap-3 mb-4'>
                             <PackageIcon className="w-6 h-6 text-gray-400" />
                            <h3 className="text-xl font-bold">2. Your Products ({products.length})</h3>
                        </div>
                        <div className="flex-grow space-y-4 pr-2 -mr-2 overflow-y-auto max-h-[22rem]">
                            {products.map(p => (
                                <div key={p.id} className="relative group bg-white/5 p-4 rounded-xl border border-white/10 transition-colors hover:border-pink-500/50 shadow-md">
                                    <div className="flex items-start gap-4">
                                        <div className="relative group/image flex-shrink-0">
                                            <img src={p.preview} alt="Product" className="w-20 h-20 object-cover rounded-md" />
                                            <button
                                                onClick={() => {
                                                    const callback = async (newFile: File) => {
                                                        const newPreview = await fileToDataUrl(newFile);
                                                        setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, file: newFile, preview: newPreview } : prod));
                                                    };
                                                    setEditingImage({ file: p.file, callback });
                                                }}
                                                className="absolute inset-0 bg-black/60 rounded-md flex items-center justify-center opacity-0 group-hover/image:opacity-100 transition-opacity cursor-pointer text-white"
                                            >
                                                <EditIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <div className="flex-grow space-y-2">
                                            <input type="text" placeholder="Product Name" value={p.name} onChange={(e) => updateProduct(p.id, 'name', e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-1.5 text-sm placeholder-gray-400 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none transition" />
                                            <input type="text" placeholder="Brand Name" value={p.brand} onChange={(e) => updateProduct(p.id, 'brand', e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-1.5 text-sm placeholder-gray-400 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none transition" />
                                            <input type="text" placeholder="Product URL (for AI context)" value={p.url} onChange={(e) => updateProduct(p.id, 'url', e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-1.5 text-sm placeholder-gray-400 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none transition" />
                                        </div>
                                    </div>
                                    <button onClick={() => removeProduct(p.id)} className="absolute top-3 right-3 p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"><XIcon className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                        <label htmlFor="product-upload" className="mt-4 border-2 border-dashed border-gray-600 hover:border-pink-500 hover:text-pink-400 w-full flex items-center justify-center p-4 rounded-lg cursor-pointer text-gray-500 transition-colors">
                            <PlusIcon className="w-5 h-5 mr-2" /> Add Product
                        </label>
                        <input type="file" accept="image/*" onChange={(e) => e.target.files && handleProductUpload(e.target.files[0])} className="hidden" id="product-upload" />
                    </div>
                  </div>

                  {/* Right Column: Creative Direction */}
                  <div className="bg-black/20 p-6 rounded-2xl border border-white/10">
                    <div className='flex items-center gap-3 mb-6'>
                         <BrushIcon className="w-6 h-6 text-gray-400" />
                        <h3 className="text-xl font-bold">3. Creative Direction</h3>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <label htmlFor="persona" className="block text-sm font-medium text-gray-300 mb-2">Ad Persona</label>
                            <select 
                                id="persona" 
                                value={selectedPersona.name} 
                                onChange={(e) => setSelectedPersona(personas.find(p => p.name === e.target.value) || personas[0])} 
                                className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm placeholder-gray-400 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none transition"
                            >
                                {personas.map(p => <option key={p.name}>{p.name}</option>)}
                            </select>
                        </div>

                        {selectedPersona.name === 'Custom Persona' && (
                             <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                <label htmlFor="custom-persona-prompt" className="block text-sm font-medium text-pink-400 mb-2">Describe Your Custom Persona</label>
                                <textarea 
                                    id="custom-persona-prompt" 
                                    value={customPersonaPrompt} 
                                    onChange={(e) => setCustomPersonaPrompt(e.target.value)} 
                                    rows={3} 
                                    className="w-full bg-white/10 border border-pink-500/50 rounded-md px-3 py-2 text-sm placeholder-gray-400 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none transition" 
                                    placeholder="e.g., A 30-year-old Scandinavian architect in a minimalist studio, wearing black turtleneck..."
                                ></textarea>
                            </div>
                        )}

                        <div>
                            <label htmlFor="product-placement" className="block text-sm font-medium text-gray-300 mb-2">Product Presentation / Placement</label>
                            <textarea 
                                id="product-placement" 
                                value={productPlacement} 
                                onChange={(e) => setProductPlacement(e.target.value)} 
                                rows={2} 
                                className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm placeholder-gray-400 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none transition" 
                                placeholder="e.g., Held in hand, sitting on a marble table, floating in the air..."
                            ></textarea>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {productPlacementSuggestions.map(sugg => (
                                    <button 
                                        key={sugg} 
                                        onClick={() => setProductPlacement(sugg)}
                                        className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1 text-gray-400 hover:text-white transition-colors"
                                    >
                                        {sugg}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="brand-voice" className="block text-sm font-medium text-gray-300 mb-2">Brand Voice / Key Messages</label>
                            <textarea id="brand-voice" value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} rows={2} className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm placeholder-gray-400 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none transition" placeholder="e.g., Playful and witty, use emojis."></textarea>
                        </div>
                        
                        <div>
                            <label htmlFor="custom-prompt" className="block text-sm font-medium text-gray-300 mb-2">Style Guide (Optional)</label>
                            <textarea id="custom-prompt" value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={2} className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm placeholder-gray-400 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 outline-none transition" placeholder="e.g., cinematic lighting, close-up shot..."></textarea>
                        </div>
                    </div>
                     <div className="mt-12 text-center">
                        <button
                          onClick={handleGenerate}
                          disabled={generating || (!selfie && useFaceLock) || products.length === 0}
                          className="w-full bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-5 px-16 rounded-full text-xl flex items-center justify-center mx-auto transition-all transform hover:scale-105 shadow-lg shadow-pink-500/20"
                        >
                            <SparklesIcon className="w-6 h-6 mr-3" />
                            Generate Ads
                        </button>
                    </div>
                  </div>
                </div>

            </div>
        ) : (
            <>
              {generating && (
                <div className="text-center mt-8">
                    <div className="flex justify-center items-center mb-4">
                        <Loader2Icon className="w-12 h-12 animate-spin text-pink-400"/>
                    </div>
                    <p className="text-gray-400 text-xl">Hold tight! Our AI is crafting your ads...</p>
                    <p className="text-gray-500">This can take a moment.</p>
                </div>
              )}
              
              {!generating && adVariations.length > 0 && (
                 <>
                  <div className="text-center mb-12">
                    <h2 className="text-4xl font-bold mb-2">Your Generated Ads 🎉</h2>
                     <p className="text-gray-400 text-lg">{adVariations.filter(ad => !ad.error).length} of {adVariations.length} variations generated successfully!</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                    {adVariations.map((ad) => (
                      <div key={ad.id} className="bg-black/20 backdrop-blur-lg rounded-xl overflow-hidden border border-white/10 hover:border-pink-400/50 transition-all group">
                        <div className="relative aspect-[1/1] bg-black/30">
                          {ad.preview && <img src={ad.preview} alt={ad.template} className="w-full h-full object-cover" />}
                          <div className="absolute top-2 right-2 bg-black/50 text-xs px-2 py-1 rounded-full">
                            {ad.platform} • {ad.ratio}
                          </div>
                        </div>
                        {ad.error ? (
                          <div className="p-4 space-y-3 bg-red-900/30">
                            <div className="flex items-center gap-2 text-red-300">
                              <AlertTriangleIcon className="w-5 h-5" />
                              <h3 className="font-bold text-lg">Generation Failed</h3>
                            </div>
                            <p className="text-sm text-red-300/80 bg-black/30 p-2 rounded-md">{ad.error}</p>
                          </div>
                        ) : (
                          <div className="p-4 space-y-4">
                            <h3 className="font-bold text-lg">{ad.template}</h3>
                            <div className="bg-black/30 rounded-lg p-3">
                                <p className="text-sm text-gray-300 leading-relaxed max-h-20 overflow-auto">{ad.caption}</p>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-semibold text-gray-400">SHARE</span>
                                    <button title="Share on X" onClick={() => handleShare('twitter', ad.caption)} className="text-gray-400 hover:text-white transition-colors"><TwitterIcon className="w-5 h-5"/></button>
                                    <button title="Share on Facebook" onClick={() => handleShare('facebook', ad.caption)} className="text-gray-400 hover:text-white transition-colors"><FacebookIcon className="w-5 h-5"/></button>
                                    <button title="Copy for Instagram" onClick={() => handleInstagramShare(ad.caption, ad.id)} className="text-gray-400 hover:text-white transition-colors"><InstagramIcon className="w-5 h-5"/></button>
                                </div>
                                <button onClick={() => ad.preview && downloadImage(ad.preview, `${ad.platform}-${ad.template}.jpg`)} className="bg-pink-500 hover:bg-pink-600 py-2 px-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-sm">
                                    <DownloadIcon className="w-4 h-4" />
                                    Download
                                </button>
                            </div>
                            {shareNotification && shareNotification.id === ad.id && (
                                <p className="text-center text-xs text-green-400">{shareNotification.message}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
        )}
      </main>
      {editingImage && (
        <ImageEditor
          imageFile={editingImage.file}
          onSave={(newFile) => {
            editingImage.callback(newFile);
            setEditingImage(null);
          }}
          onClose={() => setEditingImage(null)}
        />
      )}
    </div>
  );
};

export default App;