import { Box, SimpleGrid, For } from '@chakra-ui/react'
import { memo, useCallback } from 'react'
import { LuExternalLink } from 'react-icons/lu'
import { type Bookmark, isXTwitterMetadata } from '@/types/bookmark'
import { useModal } from '@/components/modals/ModalProvider'
import LazyImage from '@/components/LazyImage'
import { useRef, useEffect } from 'react'

function AutoPlayVideo({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  const proxiedSrc = `https://bookmarkhub-share-api.rinpopoyo.workers.dev/proxy-video?url=${encodeURIComponent(src)}`

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play().catch(() => {
              // 自動再生がブラウザにブロックされた場合は無視
            })
          } else {
            video.pause()
          }
        })
      },
      { threshold: 0.5 } // 画面に50%以上映ったら再生
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  return (
    <video
      ref={videoRef}
      src={proxiedSrc}
      poster={poster}
      muted
      loop
      playsInline
      controls
      style={{ width: '100%', maxHeight: '400px', display: 'block' }}
      {...({ referrerPolicy: 'no-referrer' } as React.VideoHTMLAttributes<HTMLVideoElement>)}
    />
  )
}

interface BookmarkMediaProps {
  bookmark: Bookmark
  isInBulkMode: boolean
  getContent: string
}

const BookmarkMedia = memo(
  ({ bookmark, isInBulkMode, getContent }: BookmarkMediaProps) => {
    const { showImageModal } = useModal()

    const hasMedia = () => {
      if (bookmark.thumbnail_url) {
        return true
      }

      if (isXTwitterMetadata(bookmark.metadata)) {
        const hasContentImages = bookmark.metadata.images && bookmark.metadata.images.length > 0
        const hasVideo = bookmark.metadata.has_video || false
        return hasContentImages || hasVideo
      }

      return false
    }

    const getMediaContent = () => {
      if (isXTwitterMetadata(bookmark.metadata)) {
        const hasContentImages = bookmark.metadata.images && bookmark.metadata.images.length > 0
        const hasVideo = bookmark.metadata.has_video || false

        if (hasContentImages || hasVideo) {
          return {
            type: hasVideo ? 'video' : 'images',
            images: bookmark.metadata.images || [],
            hasVideo: hasVideo,
          }
        }
      }

      if (bookmark.thumbnail_url) {
        return {
          type: 'images',
          images: [bookmark.thumbnail_url],
          hasVideo: false,
        }
      }

      return null
    }

    const handleImageClick = useCallback(
      (images: string[], initialIndex: number) => {
        if (isInBulkMode) return

        showImageModal({
          images: images,
          initialIndex: initialIndex,
          title:
            getContent.slice(0, 100) + (getContent.length > 100 ? '...' : ''),
        })
      },
      [isInBulkMode, showImageModal, getContent]
    )

    if (!hasMedia()) return null

    const mediaContent = getMediaContent()

    // If no specific media content but hasMedia is true, show fallback
    if (!mediaContent && 'hasMedia' in bookmark && (bookmark as Record<string, unknown>).hasMedia) {
      return (
        <Box mb={3}>
          <Box
            h="200px"
            style={{
              background: 'var(--color-bg-primary)',
              color: 'var(--color-text-tertiary)',
            }}
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="lg"
            border="1px solid var(--color-border)"
            data-testid="media-placeholder"
          >
            📷 Media Content
          </Box>
        </Box>
      )
    }

    if (!mediaContent) return null

    const { images, hasVideo } = mediaContent

    // Video playback
    if (hasVideo) {
      const videoUrl = isXTwitterMetadata(bookmark.metadata)
        ? bookmark.metadata.video_url
        : undefined

      if (videoUrl) {
        return (
          <Box mb={3}>
            <Box
              borderRadius="lg"
              overflow="hidden"
              border="1px solid var(--color-border)"
            >
              <AutoPlayVideo
                src={videoUrl}
                poster={images[0] || undefined}
              />
            </Box>
          </Box>
        )
      }

      // video_urlが無い場合は従来通りサムネイル＋外部リンク
      return (
        <Box mb={3}>
          <Box
            position="relative"
            borderRadius="lg"
            overflow="hidden"
            border="1px solid var(--color-border)"
            cursor="pointer"
            _hover={{ filter: 'brightness(1.1)' }}
            onClick={() => {
              if (!isInBulkMode) {
                window.open(bookmark.url, '_blank')
              }
            }}
            title="Watch on Twitter"
          >
            {images.length > 0 ? (
              <LazyImage
                src={images[0]}
                alt="Video thumbnail"
                w="100%"
                h="200px"
                objectFit="contain"
              />
            ) : (
              <Box
                h="200px"
                style={{
                  background: 'var(--color-bg-primary)',
                  color: 'var(--color-text-tertiary)',
                }}
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                🎥 Video Content
              </Box>
            )}
            <Box
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
              bg="rgba(0, 0, 0, 0.8)"
              borderRadius="full"
              w="60px"
              h="60px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              color="white"
              border="2px solid rgba(255, 255, 255, 0.8)"
              _hover={{
                bg: 'rgba(0, 0, 0, 0.9)',
                borderColor: 'white',
                transform: 'translate(-50%, -50%) scale(1.1)',
              }}
              transition="all 0.2s ease"
              cursor="pointer"
            >
              <LuExternalLink size={24} />
            </Box>
          </Box>
        </Box>
      )
    }
    // Images
    if (images.length > 0) {
      return (
        <Box mb={3}>
          <Box
            borderRadius="lg"
            overflow="hidden"
            border="1px solid var(--color-border)"
          >
            {images.length === 1 ? (
              <LazyImage
                src={images[0]}
                alt="Tweet image"
                w="100%"
                h="200px"
                objectFit="contain"
                cursor={isInBulkMode ? 'default' : 'pointer'}
                _hover={isInBulkMode ? {} : { filter: 'brightness(1.1)' }}
                onClick={(e: React.MouseEvent) => {
                  if (isInBulkMode) {
                    e.preventDefault()
                    e.stopPropagation()
                    return
                  }
                  handleImageClick(images, 0)
                }}
              />
            ) : (
              <SimpleGrid columns={images.length === 2 ? 2 : 2} gap={1}>
                <For each={images.slice(0, 4)}>
                  {(imageUrl, index) => (
                    <Box key={`img-${index}`} position="relative">
                      <LazyImage
                        src={String(imageUrl)}
                        alt={`Tweet image ${index + 1}`}
                        w="100%"
                        h={images.length === 2 ? '150px' : '100px'}
                        objectFit="contain"
                        cursor={isInBulkMode ? 'default' : 'pointer'}
                        _hover={
                          isInBulkMode ? {} : { filter: 'brightness(1.1)' }
                        }
                        onClick={(e: React.MouseEvent) => {
                          if (isInBulkMode) {
                            e.preventDefault()
                            e.stopPropagation()
                            return
                          }
                          handleImageClick(images, index)
                        }}
                      />
                      {/* Show +N overlay for additional images */}
                      {index === 3 && images.length > 4 && (
                        <Box
                          position="absolute"
                          top="0"
                          left="0"
                          right="0"
                          bottom="0"
                          bg="rgba(0, 0, 0, 0.7)"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          color="white"
                          fontWeight="bold"
                          fontSize="lg"
                        >
                          +{images.length - 4}
                        </Box>
                      )}
                    </Box>
                  )}
                </For>
              </SimpleGrid>
            )}
          </Box>
        </Box>
      )
    }

    return null
  }
)

BookmarkMedia.displayName = 'BookmarkMedia'

export default BookmarkMedia
