# get から chart0 への移行

get のスクリプト32本と data を collector/ に移した。
収集→整形→chart0/data への反映を同一ジョブで順番に実行する。
元の CSV 名・表示用コード対応を維持する（057 の VIX/一般消費の重複も既存通り。別途整理が必要）。
スクリプトが異常終了した場合はワークフローを失敗にし、同期を進めない。
元スクリプト内部で握りつぶす取得エラーやCSVの鮮度までは保証しない。

- 平日16:40 JST: scheduled-chart0-daily（株価・財務、既存）
- 平日19:00 JST: scheduled-collect-jp
- 火〜土07:00 JST: scheduled-collect-usa
- 新しい収集ワークフローには GitHub cron を設定しない。
- jpx_data 配信用に chart0 の Secrets に SYNC_TOKEN が必要。
- 旧 get は新経路の実行・データ確認後に定期起動を停止。まだ削除しない。
- GitHub の workflow_run 完了通知により jpx_data 同期が動く。
- chart0_table の既存 push 起動は GITHUB_TOKEN によるコミットでは動かないため、必要なら別途対応する。

履歴の取り込み元: keroppa88/get 1319cfb7052def94557fa68e99c4b134c8b703da
