
import React from 'react';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  onClose: () => void;
}

const SearchResults: React.FC<SearchResultsProps> = ({ results, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Search results</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-4">
          {results.map((result, index) => (
            <div key={index} className="bg-gray-700 p-4 rounded-lg">
              <a href={result.link} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold text-blue-400 hover:underline">
                {result.title}
              </a>
              <p className="text-gray-300 mt-1">{result.snippet}</p>
              <p className="text-xs text-gray-500 mt-2">{result.link}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchResults;