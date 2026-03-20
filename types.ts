import React from 'react';

export interface AdTemplate {
    id: string;
    name: string;
    desc: string;
    platform: string;
}

export interface Platform {
    id: string;
    name: string;
    ratio: string;
    // FIX: Replaced JSX.Element with React.ReactElement to resolve "Cannot find namespace 'JSX'" error in a .ts file.
    icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
}

export interface Selfie {
    file: File;
    preview: string;
    description?: string;
}

export interface Product {
    id: string;
    file: File;
    preview: string;
    name?: string;
    brand?: string;
    url?: string;
    description?: string;
}

export interface AdVariation {
  id:string;
  template: string;
  platform: string;
  ratio: string;
  prompt?: string;
  preview?: string; // This will be a base64 data URL
  caption?: string;
  error?: string;
}

export interface SelfieQualityReport {
  isUsable: boolean;
  score: number; // Score from 0 to 10
  feedback: string[];
}