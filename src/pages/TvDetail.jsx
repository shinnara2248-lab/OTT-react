
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMovieStore } from '../store/useMovieStore';

export const TvDetail = () => {
  const { id } = useParams();
  const tvId = Number(id);

  const {
    tvs,
    tvDetails,
    tvVideo,
    onFetchTvVideo,
    seasons,
    onFetchSeason,
    episodes,
    onFetchEpisode,
    onFetchEpisodeVideo,
    onSearchYoutubeEpisode,
  } = useMovieStore();

  // 상태
  const [showPopup, setShowPopup] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [playingEpisode, setPlayingEpisode] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState('');

  // TV 정보
  const tv = tvs.find((item) => item.id === tvId)
    || tvDetails[tvId];

  const seasonList = seasons[tvId] || [];
  const episodeKey = `${tvId}-${selectedSeason}`;
  const episodeList = episodes[episodeKey] || [];
  const tvVideoList = tvVideo[tvId] || [];

  const trailer = tvVideoList.find(
    (video) =>
      video.site === 'YouTube' &&
      video.type === 'Trailer'
  );

  // TV 상세 및 시즌 정보
  useEffect(() => {
    if (!Number.isInteger(tvId) || tvId <= 0) return;

    setSelectedSeason('');
    setShowPopup(false);
    setPlayingEpisode(null);
    setSelectedVideo(null);
    setVideoError('');

    onFetchSeason(tvId);
    onFetchTvVideo(tvId);
  }, [tvId, onFetchSeason, onFetchTvVideo]);

  // 첫 번째 시즌 자동 선택
  useEffect(() => {
    if (!seasonList.length) return;

    const exists = seasonList.some(
      (season) =>
        String(season.season_number) ===
        String(selectedSeason)
    );

    if (!exists) {
      setSelectedSeason(
        String(seasonList[0].season_number)
      );
    }
  }, [seasonList, selectedSeason]);

  // 시즌별 에피소드
  useEffect(() => {
    if (!tvId || selectedSeason === '') return;

    onFetchEpisode(tvId, Number(selectedSeason));
  }, [tvId, selectedSeason, onFetchEpisode]);

  // TV 전체 예고편
  const handlePopup = () => {
    setPlayingEpisode(null);
    setSelectedVideo(null);
    setVideoError('');
    setShowPopup(true);
  };

  // 에피소드 영상 검색 및 자동 재생
  const handleEpisodePlay = async (episode) => {
    setPlayingEpisode(episode);
    setSelectedVideo(null);
    setVideoError('');
    setShowPopup(true);
    setVideoLoading(true);

    try {
      // TMDB 영상 먼저 확인
      const tmdbVideos = await onFetchEpisodeVideo(
        tvId,
        Number(selectedSeason),
        episode.episode_number
      );

      const tmdbTrailer =
        tmdbVideos.find(
          (video) =>
            video.site === 'YouTube' &&
            video.type === 'Trailer' &&
            video.official
        ) ||
        tmdbVideos.find(
          (video) =>
            video.site === 'YouTube' &&
            video.type === 'Trailer'
        ) ||
        tmdbVideos.find(
          (video) =>
            video.site === 'YouTube' &&
            video.type === 'Teaser'
        );

      if (tmdbTrailer) {
        setSelectedVideo({
          key: tmdbTrailer.key,
          name: tmdbTrailer.name,
        });
        return;
      }

      // TMDB 영상이 없으면 YouTube 검색
      const results = await onSearchYoutubeEpisode(
        tv?.name || 'TV 프로그램',
        tv?.original_name || '',
        Number(selectedSeason),
        episode.episode_number
      );

      // 첫 번째 검색 결과 자동 선택
      if (results.length > 0) {
        setSelectedVideo(results[0]);
      } else {
        setVideoError(
          '검색 결과가 없습니다. API 키, API 활성화 상태 및 할당량을 확인해 주세요.'
        );
      }
    } catch (error) {
      console.error('영상 검색 실패:', error);
      setVideoError('영상을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setVideoLoading(false);
    }
  };

  // 팝업 닫기
  const handleClose = () => {
    setShowPopup(false);
    setPlayingEpisode(null);
    setSelectedVideo(null);
    setVideoLoading(false);
    setVideoError('');
  };

  return (
    <section className="sub-page pt-30">

      {/* TV 상세 */}
      <div className="inner flex gap-15">

        <div className="w-2/6">
          {tv?.poster_path && (
            <img
              className="w-full"
              src={`https://image.tmdb.org/t/p/original${tv.poster_path}`}
              alt={tv.name || 'TV 포스터'}
            />
          )}
        </div>

        <div className="w-4/6">
          <h2 className="text-5xl">
            {tv?.name || 'TV 프로그램'}
          </h2>

          <p className="mt-4">
            평점: {tv?.vote_average?.toFixed(1) ?? '-'}
          </p>

          <p className="my-10">
            {tv?.overview || '등록된 줄거리가 없습니다.'}
          </p>

          <div className="flex gap-5">
            <button
              type="button"
              className="bg-black text-white p-4"
              onClick={handlePopup}
            >
              예고편 재생
            </button>

            <button
              type="button"
              className="border p-4"
            >
              찜하기
            </button>
          </div>
        </div>
      </div>

      {/* 시즌별 에피소드 */}
      <div className="inner mt-20">

        <h2 className="text-3xl font-bold mb-6">
          시즌별 에피소드
        </h2>

        <div className="flex flex-wrap gap-3 mb-8">
          {seasonList.map((season) => (
            <button
              key={season.id ?? season.season_number}
              type="button"
              onClick={() =>
                setSelectedSeason(
                  String(season.season_number)
                )
              }
              className={`border rounded-lg px-5 py-3 ${String(season.season_number) ===
                  String(selectedSeason)
                  ? 'bg-black text-white'
                  : 'bg-white text-black'
                }`}
            >
              {season.name ||
                `시즌 ${season.season_number}`}
            </button>
          ))}
        </div>

        {selectedSeason !== '' && (
          <div>
            <h3 className="text-xl font-bold mb-5">
              {seasonList.find(
                (season) =>
                  String(season.season_number) ===
                  String(selectedSeason)
              )?.name || `시즌 ${selectedSeason}`}
            </h3>

            {episodeList.length > 0 ? (
              <div className="flex flex-col gap-6">
                {episodeList.map((episode) => (
                  <div
                    key={episode.id}
                    className="flex gap-5 border-b pb-6"
                  >
                    <div className="w-1/3 shrink-0">
                      {episode.still_path ? (
                        <img
                          className="w-full rounded-lg"
                          src={`https://image.tmdb.org/t/p/w500${episode.still_path}`}
                          alt={episode.name}
                        />
                      ) : (
                        <div className="aspect-video bg-gray-200 rounded-lg flex items-center justify-center">
                          이미지 없음
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      <h4 className="text-xl font-bold mb-2">
                        {episode.episode_number}화.{' '}
                        {episode.name}
                      </h4>

                      <p className="text-sm text-gray-500 mb-3">
                        {episode.air_date || '방영일 미정'}
                        {episode.runtime
                          ? ` · ${episode.runtime}분`
                          : ''}
                      </p>

                      <p className="leading-7">
                        {episode.overview ||
                          '등록된 에피소드 줄거리가 없습니다.'}
                      </p>

                      <button
                        type="button"
                        className="mt-4 bg-black text-white px-5 py-3 rounded-lg"
                        onClick={() =>
                          handleEpisodePlay(episode)
                        }
                      >
                        ▶ 에피소드 재생
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">
                에피소드 정보를 불러오는 중이거나 등록된 에피소드가 없습니다.
              </p>
            )}
          </div>
        )}

        {seasonList.length === 0 && (
          <p className="text-gray-500">
            시즌 정보를 불러오는 중이거나 등록된 시즌이 없습니다.
          </p>
        )}
      </div>

      {/* 전체 화면 팝업 */}
      {showPopup && (
        <div className="fixed inset-0 w-screen h-screen bg-black z-[10000]">

          <button
            type="button"
            className="absolute top-5 right-5 z-50 bg-white text-black px-5 py-3 rounded-lg"
            onClick={handleClose}
          >
            닫기 ✕
          </button>

          <div className="absolute inset-0 w-full h-full">

            {videoLoading ? (
              <div className="flex items-center justify-center w-full h-full">
                <p className="text-white text-xl">
                  영상을 불러오는 중...
                </p>
              </div>
            ) : playingEpisode ? (

              selectedVideo ? (
                <iframe
                  key={selectedVideo.key}
                  className="absolute inset-0 w-full h-full border-0"
                  src={`https://www.youtube.com/embed/${selectedVideo.key}?autoplay=1`}
                  title={selectedVideo.name || '에피소드 영상'}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full">
                  <p className="text-white text-xl text-center px-6">
                    {videoError ||
                      '재생 가능한 영상이 없습니다.'}
                  </p>
                </div>
              )

            ) : trailer ? (
              <iframe
                key={trailer.key}
                className="absolute inset-0 w-full h-full border-0"
                src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=1`}
                title={`${tv?.name || 'TV 프로그램'} 예고편`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <p className="text-white text-xl">
                  등록된 예고편이 없습니다.
                </p>
              </div>
            )}

          </div>
        </div>
      )}
    </section>
  );
};
