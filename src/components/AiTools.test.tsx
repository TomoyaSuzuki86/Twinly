import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {AiTools} from './AiTools';
import {DailySummaryEmailSettings} from './DailySummaryEmailSettings';
import {createInitialAppState} from '@/lib/app-state';

const mock=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('@/firebase',()=>({db:null,functions:null}));
vi.mock('@/lib/ai',async importOriginal=>({...await importOriginal<typeof import('@/lib/ai')>(),callService:mock.call}));

const free={plan:'free',canPreview:true,features:{aiReview:false,aiChat:false,dailySummaryEmail:false}};
const premium={plan:'premium',canPreview:true,features:{aiReview:true,aiChat:true,dailySummaryEmail:true}};
const emailSettings={enabled:false,hourJst:21,recipients:['family@example.com'],canEdit:true};

function renderTools(){
  render(<AiTools familyId="test" app={createInitialAppState()} onSave={()=>true}/>);
  fireEvent.click(screen.getByRole('button',{name:'料金とプラン'}));
}

describe('pricing and plans',()=>{
  afterEach(cleanup);
  beforeEach(()=>mock.call.mockReset());

  it('shows Premium value and a clear Free comparison without AI settings',async()=>{
    mock.call.mockResolvedValue(free);
    renderTools();
    expect(await screen.findByText('Twinly Premium')).toBeInTheDocument();
    expect(screen.getByText('¥500')).toBeInTheDocument();
    expect(screen.getByText('AIが育児記録を読み解く')).toBeInTheDocument();
    expect(screen.getByText('今日のまとめメール')).toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:'7日間無料でPremiumを試す'}).length).toBeGreaterThan(0);
    expect(screen.queryByText(/AIアドバイス生成時/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'メール設定を保存'})).not.toBeInTheDocument();
  });

  it('uses the upgrade CTA as the preview transition instead of a plan toggle',async()=>{
    mock.call.mockImplementation(async(name,data)=>{
      if(name==='setFamilyPreviewPlan')return data.plan==='premium'?premium:free;
      return free;
    });
    renderTools();
    const cta=(await screen.findAllByRole('button',{name:'7日間無料でPremiumを試す'}))[0];
    fireEvent.click(cta);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Premiumを使用中'})).toBeDisabled());
    expect(mock.call.mock.calls.some(([name,data])=>name==='setFamilyPreviewPlan'&&data.plan==='premium')).toBe(true);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('points Premium users to the feature-specific screens',async()=>{
    mock.call.mockResolvedValue(premium);
    renderTools();
    expect(await screen.findByRole('button',{name:'Premiumを使用中'})).toBeDisabled();
    expect(screen.getByText(/AIアドバイスはホームから、日次メールは「通知」タブから設定できます/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'開発確認用：無料版表示に戻す'})).toBeInTheDocument();
  });

  it('keeps daily-summary email controls in their own notification settings component',async()=>{
    mock.call.mockImplementation(async(name,data)=>{
      if(name==='getFamilyAccess')return premium;
      if(name==='getDailySummaryEmailSettings')return emailSettings;
      if(name==='setDailySummaryEmailSettings')return {...emailSettings,...data};
      return premium;
    });
    render(<DailySummaryEmailSettings/>);
    expect(await screen.findByText('今日のまとめメール')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox',{name:'毎日メールを送る'}));
    fireEvent.change(screen.getByLabelText('日次まとめメール送信時刻'),{target:{value:'22'}});
    fireEvent.click(screen.getByRole('button',{name:'メール設定を保存'}));
    await waitFor(()=>expect(mock.call.mock.calls.some(([name,data])=>name==='setDailySummaryEmailSettings'&&data.enabled===true&&data.hourJst===22)).toBe(true));
  });
});
