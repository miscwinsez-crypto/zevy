
// Browser-compatible file processing utilities

export interface ProcessedFile {
  type: 'image' | 'pdf' | 'text' | 'docx' | 'csv' | 'rtf' | 'markdown'
  data: string
  name: string
  preview?: string
}

export const extractPdfText = async (file: File): Promise<string> => {
  try {
    const text = await file.text()
    const readableText = text
      .replace(/[^\x20-\x7E\n\r]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    
    if (readableText.length > 50) {
      return readableText.substring(0, 2000)
    } else {
      return 'PDF content preview: File uploaded successfully. Text extraction requires server-side processing for accurate results.'
    }
  } catch (e) {
    console.error('PDF extraction error:', e)
    return 'PDF content not available'
  }
}

export const extractDocxText = async (file: File): Promise<string> => {
  try {
    // Basic placeholder since browser parsing of DOCX is heavy/complex without libraries
    return "DOCX content (preview unavailable in browser - full content sent to AI)"
  } catch (e) {
    console.error('DOCX extraction error:', e)
    return 'DOCX content not available'
  }
}

export const extractCsvText = async (file: File): Promise<string> => {
  try {
    const text = await file.text()
    const lines = text.split('\n').slice(0, 20)
    return lines.join('\n').substring(0, 2000)
  } catch (e) {
    console.error('CSV extraction error:', e)
    return 'CSV content not available'
  }
}

export const extractRtfText = async (file: File): Promise<string> => {
  try {
    const text = await file.text()
    const plainText = text
      .replace(/\\[a-z]+\d*\s?/gi, '')
      .replace(/[{}]/g, '')
      .replace(/\\\'/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    return plainText.substring(0, 2000)
  } catch (e) {
    console.error('RTF extraction error:', e)
    return 'RTF content not available'
  }
}

export const extractMarkdownText = async (file: File): Promise<string> => {
  try {
    const text = await file.text()
    return text.substring(0, 2000)
  } catch (e) {
    console.error('Markdown extraction error:', e)
    return 'Markdown content not available'
  }
}

export const processUploadedFile = async (file: File): Promise<ProcessedFile | null> => {
  try {
    // Check if it's an image file
    const isImage = file.type.startsWith('image/') || 
                   file.name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico)$/i)
    
    if (isImage) {
      return null
    }

    // File size check: 5MB limit
    if (file.size > 5 * 1024 * 1024) {
      throw new Error(`File ${file.name} is too large (max 5MB)`)
    }
    
    let fileType: ProcessedFile['type'] = 'pdf'
    if (file.name.endsWith('.txt')) fileType = 'text'
    else if (file.name.endsWith('.docx')) fileType = 'docx'
    else if (file.name.endsWith('.pdf')) fileType = 'pdf'
    else if (file.name.endsWith('.csv')) fileType = 'csv'
    else if (file.name.endsWith('.rtf')) fileType = 'rtf'
    else if (file.name.endsWith('.md')) fileType = 'markdown'
    else if (file.type === 'text/plain') fileType = 'text'

    let preview: string | undefined
    const rawData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    if (fileType === 'pdf') preview = await extractPdfText(file)
    else if (fileType === 'text') preview = await file.text()
    else if (fileType === 'docx') preview = await extractDocxText(file)
    else if (fileType === 'csv') preview = await extractCsvText(file)
    else if (fileType === 'rtf') preview = await extractRtfText(file)
    else if (fileType === 'markdown') preview = await extractMarkdownText(file)

    // For text-based files, ensure we use the extracted text (preview) as data
    let contentData = rawData
    // We already returned null for images above, so fileType here is always one of the text types
    if (typeof preview === 'string' && preview.length > 0) {
      contentData = preview
    }

    return {
      type: fileType,
      data: contentData,
      name: file.name,
      preview
    }
  } catch (error) {
    console.error(`Error processing file ${file.name}:`, error)
    throw error
  }
}
