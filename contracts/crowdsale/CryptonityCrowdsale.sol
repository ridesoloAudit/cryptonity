pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/crowdsale/validation/CappedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/WhitelistedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/validation/TimedCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/distribution/RefundableCrowdsale.sol";
import "openzeppelin-solidity/contracts/crowdsale/distribution/PostDeliveryCrowdsale.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../token/CryptonityToken.sol";
import "./FiatContract.sol";


/**
 * @title CryptonityCrowdsale
 * @dev CryptonityCrowdsale
 */
// solium-disable-next-line max-len
contract CryptonityCrowdsale is CappedCrowdsale, TimedCrowdsale, WhitelistedCrowdsale, RefundableCrowdsale, PostDeliveryCrowdsale, Pausable {

  using SafeMath for uint256;

  // public supply of token
  uint256 public publicSupply = 60000000 * 1 ether;
  // bounty supply of token
  uint256 public bountySupply = 10000000 * 1 ether;
  // team supply of the token
  uint256 public teamSupply = 20000000 * 1 ether;
  // advisors supply of the token
  uint256 public advisorsSupply = 3000000 * 1 ether;
  // team supply of the token
  uint256 public insuranceSupply = 7000000 * 1 ether;

  // remaining public supply of token
  uint256 public remainingPublicSupply = publicSupply;
  // remaining bounty supply of token
  uint256 public remainingBountySupply = bountySupply;
  // remaining team supply of token
  uint256 public remainingTeamSupply = teamSupply;
  // remaining advisors supply of token
  uint256 public remainingAdvisorsSupply = advisorsSupply;
  // remaining insurance supply of token
  uint256 public remainingInsuranceSupply = insuranceSupply;

  // phases start time in Unix epoch timestamp
  uint256 constant public phase1StartTime = 1541073600; // 2018-11-01 12:00 GMT+0
  uint256 constant public phase2StartTime = 1543665600; // 2018-12-01 12:00 GMT+0
  uint256 constant public phase3StartTime = 1544875200;  // 2018-12-15 12:00 GMT+0

  // phases bonuses in percentage
  uint256 constant public phase1Bonus = 50;
  uint256 constant public phase2Bonus = 30;
  uint256 constant public phase3Bonus = 15;

  uint256 deliveryTime;

  FiatContract public price;

  event NewPayment(address sender, uint256 amount);
  event EventCancelation(uint256 id);
  event Withdrawal(address to, uint256 amount);

  /**
   * @param _openingTime Crowdsale opening time
   * @param _closingTime Crowdsale closing time
   * @param _rate Number of token units a buyer gets per wei
   * @param _wallet Address where collected funds will be forwarded to
   * @param _token Address of the token being sold
   * @param _softCap Funding goal
   * @param _hardCap Max amount of wei to be contributed
   */
  constructor(
    uint256 _openingTime,
    uint256 _closingTime,
    uint256 _rate,
    address _wallet,
    ERC20 _token,
    uint256 _softCap,
    uint256 _hardCap,
    address _fiatContract
  )
    public
    Crowdsale(_rate, _wallet, _token)
    CappedCrowdsale(_hardCap)
    TimedCrowdsale(_openingTime, _closingTime)
    RefundableCrowdsale(_softCap)
  {
    require(_softCap <= _hardCap);
    price = FiatContract(_fiatContract);
    // token delivery starts 15 days after the crowdsale ends
    deliveryTime = _closingTime.add(60*60*24*15);
  }

  /**
  * @dev Returns the token sale bonus percentage depending on the current time
  */
  function getCurrentBonus() public view returns (uint256) {
    require(now >= openingTime);

    if (now < phase2StartTime) {
      return phase1Bonus;
    } else if (now < phase3StartTime) {
      return phase2Bonus;
    } else if (now < closingTime) {
      return phase3Bonus;
    } else {
      return 0;
    }
  }

  /**
   * @dev Validation of an incoming purchase. Allowas purchases only when crowdsale is not paused.
   * @param _beneficiary Address performing the token purchase
   * @param _weiAmount Value in wei involved in the purchase
   */
  function _preValidatePurchase(address _beneficiary, uint256 _weiAmount) internal whenNotPaused {
    super._preValidatePurchase(_beneficiary, _weiAmount);
  }

  /**
   * @dev The way in which ether is converted to tokens.
   * Add bonuses to tokens.
   * @param _weiAmount Value in wei to be converted into tokens
   * @return Number of tokens that can be purchased with the specified _weiAmount
   */
  function _getTokenAmount(uint256 _weiAmount) internal view returns (uint256)
  {
    uint256 totalTokens = _weiAmount.mul(rate);
    uint256 bonusPercent = getCurrentBonus();

    if (bonusPercent > 0) {
      uint256 bonusTokens = totalTokens.mul(bonusPercent).div(100); // tokens * bonus (%) / 100%
      totalTokens = totalTokens.add(bonusTokens);
    }

    return totalTokens;
  }

  /**
   * @dev Executed when a purchase has been validated and is ready to be executed. Not necessarily emits/sends tokens.
   * It computes the bonus.
   * @param _beneficiary Address receiving the tokens
   * @param _tokenAmount Number of tokens to be purchased
   */
  function _processPurchase(address _beneficiary, uint256 _tokenAmount) internal {
    super._processPurchase(_beneficiary, _tokenAmount);
  }

  /**
  * @dev Withdraw tokens only after the deliveryTime
  */
  function withdrawTokens() public {
    require(goalReached());
    // solium-disable-next-line security/no-block-members
    require(block.timestamp > deliveryTime);
    super.withdrawTokens();
  }

  // returns $1.00 USD in ETH wei.
  function OneETHUSD() view returns (uint256) {
    // returns $0.01 ETH wei
    uint256 ethCent = price.USD(0);
    // $0.01 * 100 = $1.00
    return ethCent * 100;
  }

  // returns 1 XNY in ETH wei.
  function OneXNYETH() view returns (uint256) {
    // returns $0.01 XNY wei
    uint256 xnyCent = price.ETH(0);
    // $0.01 * 100 = $1.00
    return xnyCent * 100;
  }

  // returns 1 ETH wei in USD.
  function OneWEIUSD() view returns (uint256) {
    // returns 1 wei usd cent
    uint256 weiCent = OneETHUSD().sub(OneXNYETH());
    return weiCent * 100;
  }

}