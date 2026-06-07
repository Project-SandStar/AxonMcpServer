'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getApiBase } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface DocFile {
  name: string;
  path: string;
  label: string;
}

interface ServerInfo {
  serverPath: string;
  port: number;
}

const BASE_PATH = '/dashboard';

const DOC_FILES: DocFile[] = [
  { name: 'index', path: `${BASE_PATH}/docs/index.md`, label: 'Overview' },
  { name: 'quick-start', path: `${BASE_PATH}/docs/quick-start.md`, label: 'Quick Start (Stdio)' },
  { name: 'installation', path: `${BASE_PATH}/docs/installation.md`, label: 'Installation' },
];

function DocumentationLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-gray-500">Loading documentation...</div>
    </div>
  );
}

export default function DocumentationPage() {
  return (
    <Suspense fallback={<DocumentationLoading />}>
      <DocumentationContent />
    </Suspense>
  );
}

function DocumentationContent() {
  const { isLoading: authLoading, getAuthHeader } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const docParam = searchParams.get('doc');
  const [selectedDoc, setSelectedDoc] = useState<string>(docParam || 'index');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  // Fetch server info for template variables
  useEffect(() => {
    if (authLoading) return;
    const fetchServerInfo = async () => {
      try {
        const response = await fetch(`${getApiBase()}/admin/status`, {
          headers: {
            'Authorization': getAuthHeader(),
          },
        });
        if (response.ok) {
          const data = await response.json();
          setServerInfo({
            serverPath: data.serverPath || '/path/to/axon-mcp-server/dist/index.js',
            port: data.port || 3847,
          });
        } else {
          const currentPort = window.location.port ? parseInt(window.location.port) : 3847;
          setServerInfo({
            serverPath: '/path/to/axon-mcp-server/dist/index.js',
            port: currentPort,
          });
        }
      } catch {
        const currentPort = window.location.port ? parseInt(window.location.port) : 3847;
        setServerInfo({
          serverPath: '/path/to/axon-mcp-server/dist/index.js',
          port: currentPort,
        });
      }
    };
    fetchServerInfo();
  }, [authLoading, getAuthHeader]);

  useEffect(() => {
    if (docParam && docParam !== selectedDoc) {
      const validDoc = DOC_FILES.find(d => d.name === docParam);
      if (validDoc) {
        setSelectedDoc(docParam);
      }
    }
  }, [docParam, selectedDoc]);

  const handleSelectDoc = (docName: string) => {
    setSelectedDoc(docName);
    const url = docName === 'index'
      ? '/documentation/'
      : `/documentation/?doc=${docName}`;
    router.push(url);
  };

  const processContent = (text: string): string => {
    if (!serverInfo) return text;
    const serverDir = serverInfo.serverPath.replace(/\/dist\/index\.js$/, '');
    return text
      .replace(/\{\{SERVER_PATH\}\}/g, serverInfo.serverPath)
      .replace(/\{\{SERVER_DIR\}\}/g, serverDir)
      .replace(/\{\{PORT\}\}/g, String(serverInfo.port));
  };

  const headings = useMemo(() => {
    if (!content || !serverInfo) return [];
    const processed = processContent(content);
    const matches = [...processed.matchAll(/^(#{2,3})\s+(.+)$/gm)];
    return matches.map(m => ({
      level: m[1].length,
      text: m[2],
      slug: m[2].toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
    }));
  }, [content, serverInfo]);

  useEffect(() => {
    const loadDoc = async () => {
      setLoading(true);
      setError(null);

      const docFile = DOC_FILES.find(d => d.name === selectedDoc);
      if (!docFile) {
        setError('Document not found');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(docFile.path);
        if (!response.ok) {
          throw new Error(`Failed to load: ${response.status}`);
        }
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    loadDoc();
  }, [selectedDoc]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Documentation</h2>
        <nav className="space-y-1">
          {DOC_FILES.map((doc) => (
            <button
              key={doc.name}
              onClick={() => handleSelectDoc(doc.name)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedDoc === doc.name
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {doc.label}
            </button>
          ))}
        </nav>

        <div className="mt-8 pt-4 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Quick Links</h3>
          <div className="space-y-1">
            <a
              href={`${BASE_PATH}/explorer/`}
              className="block px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
            >
              &rarr; MCP Explorer
            </a>
            <a
              href={`${BASE_PATH}/docs/`}
              className="block px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
            >
              &rarr; Docs Explorer
            </a>
            <a
              href={`${BASE_PATH}/config/`}
              className="block px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
            >
              &rarr; Configuration
            </a>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading || !serverInfo ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading documentation...</div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-red-800 font-medium">Error loading documentation</h2>
            <p className="text-red-600 mt-1">{error}</p>
          </div>
        ) : (
          <article className="prose prose-slate max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-gray-800 prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:text-gray-100 [&_pre_code]:p-0 prose-table:border prose-th:bg-gray-100 prose-th:p-2 prose-td:p-2 prose-td:border">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: ({ children, ...props }) => {
                  const text = String(children);
                  const slug = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
                  return <h2 id={slug} {...props}>{children}</h2>;
                },
                h3: ({ children, ...props }) => {
                  const text = String(children);
                  const slug = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
                  return <h3 id={slug} {...props}>{children}</h3>;
                },
              }}
            >
              {processContent(content)}
            </ReactMarkdown>
          </article>
        )}
      </div>

      {/* Table of Contents */}
      <div className="w-56 border-l border-gray-200 overflow-y-auto hidden xl:block">
        <div className="sticky top-0 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">On this page</h3>
          <nav className="space-y-1">
            {headings.map((heading) => (
              <a
                key={heading.slug}
                href={`#${heading.slug}`}
                className={`block text-sm transition-colors hover:text-blue-600 ${
                  heading.level === 2
                    ? 'font-medium text-gray-700'
                    : 'pl-3 text-gray-500'
                }`}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
