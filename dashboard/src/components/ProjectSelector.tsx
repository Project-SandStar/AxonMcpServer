'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ChevronDown, Search, Check } from 'lucide-react';

interface Project {
  instance: string;
  project: string;
  isActive?: boolean;
}

interface PrimaryProject {
  instance: string;
  project: string;
  setBy: string;
  timestamp: string | null;
}

export function ProjectSelector() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: api.getProjects,
  });

  const { data: primaryProject } = useQuery({
    queryKey: ['primaryProject'],
    queryFn: api.getPrimaryProject,
  });

  const setPrimaryMutation = useMutation({
    mutationFn: ({ instance, project }: { instance: string; project: string }) =>
      api.setPrimaryProject(instance, project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['primaryProject'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });

  const filteredProjects = projects?.filter((p: Project) => {
    if (!search) return true;
    const fullName = `${p.instance}/${p.project}`.toLowerCase();
    return fullName.includes(search.toLowerCase());
  }) || [];

  const handleSelect = (project: Project) => {
    setPrimaryMutation.mutate({ instance: project.instance, project: project.project });
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, filteredProjects.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredProjects.length) {
        handleSelect(filteredProjects[highlightedIndex]);
      } else if (filteredProjects.length === 1) {
        handleSelect(filteredProjects[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearch('');
    }
  };

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentValue = primaryProject?.instance && primaryProject?.project
    ? `${primaryProject.instance}/${primaryProject.project}`
    : '';

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Active Project
      </label>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg bg-white
                     text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2
                     focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder="Search projects..."
          value={isOpen ? search : currentValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearch('');
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 pr-3 flex items-center"
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) {
              inputRef.current?.focus();
            }
          }}
        >
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {primaryProject?.instance && primaryProject?.project && (
        <p className="mt-1 text-xs text-gray-500">
          Set by: {primaryProject.setBy}
          {primaryProject.timestamp && ` at ${new Date(primaryProject.timestamp).toLocaleString()}`}
        </p>
      )}

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
          {filteredProjects.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 italic">
              No matching projects
            </div>
          ) : (
            filteredProjects.map((project: Project, index: number) => {
              const fullName = `${project.instance}/${project.project}`;
              const isSelected = primaryProject?.instance === project.instance &&
                               primaryProject?.project === project.project;
              const isHighlighted = index === highlightedIndex;

              return (
                <button
                  key={fullName}
                  type="button"
                  className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between
                    ${isHighlighted ? 'bg-blue-50' : ''}
                    ${isSelected ? 'bg-blue-100 text-blue-900' : 'text-gray-900 hover:bg-gray-50'}
                  `}
                  onClick={() => handleSelect(project)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span>
                    {search ? (
                      highlightMatch(fullName, search)
                    ) : (
                      fullName
                    )}
                  </span>
                  {isSelected && <Check className="h-4 w-4 text-blue-600" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function highlightMatch(text: string, search: string) {
  const lowerText = text.toLowerCase();
  const lowerSearch = search.toLowerCase();
  const index = lowerText.indexOf(lowerSearch);

  if (index === -1) return text;

  return (
    <>
      {text.substring(0, index)}
      <span className="font-bold text-blue-600">
        {text.substring(index, index + search.length)}
      </span>
      {text.substring(index + search.length)}
    </>
  );
}
